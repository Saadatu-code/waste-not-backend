require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const knex = require('knex')(require('./knexfile').development);

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to clean the AI's response (less critical with JSON mode, but good for safety)
function cleanAIResponse(text) {
  if (!text) return "";
  let cleanedText = text.trim();
  if (cleanedText.startsWith("```json")) {
    cleanedText = cleanedText.substring(7).trim();
  }
  if (cleanedText.endsWith("```")) {
    cleanedText = cleanedText.slice(0, -3).trim();
  }
  return cleanedText;
}

// This is the prompt for the AI. It's simpler now because the formatting is handled by the JSON schema.
const getMealPlanPrompt = (payload) => {
  const { ingredientsText, cuisine, days, mealTypes, familySize, dietaryType } =
    payload;

  const ingredientsString =
    ingredientsText && ingredientsText.trim() !== ""
      ? `The user has these ingredients: ${ingredientsText}. Prioritize using leftovers and ingredients with early expiry dates.`
      : "The user is starting from scratch. Generate a meal plan and a comprehensive shopping list for all needed items.";

  const dietString =
    dietaryType && dietaryType.toLowerCase() !== "none"
      ? `The entire plan must be ${dietaryType}.`
      : "";

  return `
        You are an expert AI meal planner. Create a detailed meal plan based on the user's request.
        Request Details:
        - Cuisine: ${cuisine}
        - Duration: ${days} days
        - Family Size: ${familySize} people
        - Meals to Include: ${mealTypes.join(", ")}
        - Dietary Needs: ${dietString || "None"}
        - Available Ingredients: ${ingredientsString}
        
        Generate a complete plan, scaling all recipes for the specified family size and ensuring every meal has a title and detailed, step-by-step instructions. Instructions should be clear and comprehensive.
    `;
};

// --- NEW: Define the JSON schema for the AI's response ---
// This schema forces the AI to structure its output correctly.
const mealPlanSchema = {
  type: "OBJECT",
  properties: {
    shopping_list: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "A list of ingredients the user needs to buy. Can be empty.",
    },
    meal_plan: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "STRING" },
          breakfast: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              instructions: { type: "ARRAY", items: { type: "STRING" } },
              ingredientsUsed: { type: "ARRAY", items: { type: "STRING" } },
              missingIngredients: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["title", "instructions"],
          },
          lunch: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              instructions: { type: "ARRAY", items: { type: "STRING" } },
              ingredientsUsed: { type: "ARRAY", items: { type: "STRING" } },
              missingIngredients: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["title", "instructions"],
          },
          dinner: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              instructions: { type: "ARRAY", items: { type: "STRING" } },
              ingredientsUsed: { type: "ARRAY", items: { type: "STRING" } },
              missingIngredients: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["title", "instructions"],
          },
        },
        required: ["day"],
      },
    },
  },
  required: ["meal_plan"],
};

app.post("/api/generate-plan", async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: "Request body is missing." });
    }

    // Using the powerful model with the new JSON mode configuration
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: mealPlanSchema,
      },
    });

    const prompt = getMealPlanPrompt(req.body);

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // With JSON mode, the response text should already be a valid JSON string.
    const responseText = response.text();

    try {
      const parsedJson = JSON.parse(responseText);
      res.json(parsedJson);
    } catch (e) {
      console.error(
        "Fatal Error: AI response could not be parsed as JSON. Response was:",
        responseText
      );
      res
        .status(500)
        .json({
          error:
            "The AI returned a response in an unreadable format. Please try again.",
        });
    }
  } catch (error) {
    console.error("Error in /api/generate-plan:", error);
    res
      .status(500)
      .json({ error: "Failed to generate meal plan due to a server error." });
  }
});

// New endpoint to save a meal plan
app.post("/api/save-meal-plan", async (req, res) => {
  try {
    const { mealPlan } = req.body;
    if (!mealPlan) {
      return res.status(400).json({ error: "Meal plan data is required." });
    }

    await knex("meal_plans").insert({ meal_plan_data: JSON.stringify(mealPlan) });
    res.status(201).json({ message: "Meal plan saved successfully!" });
  } catch (error) {
    console.error("Error saving meal plan:", error);
    res.status(500).json({ error: "Failed to save meal plan." });
  }
});

// New endpoint to get all saved meal plans
app.get("/api/get-meal-plans", async (req, res) => {
  try {
    const mealPlans = await knex("meal_plans").select("id", "meal_plan_data", "created_at");
    const parsedMealPlans = mealPlans.map(plan => ({
      id: plan.id,
      meal_plan_data: JSON.parse(plan.meal_plan_data),
      created_at: plan.created_at,
    }));
    res.status(200).json(parsedMealPlans);
  } catch (error) {
    console.error("Error fetching meal plans:", error);
    res.status(500).json({ error: "Failed to fetch meal plans." });
  }
});

// The /api/generate-recipe endpoint is not used by the current UI, but we leave it for future use.
app.post("/api/generate-recipe", async (req, res) => {
  // ...
});

// New endpoint to add a meal to favorites
app.post("/api/add-favorite-meal", async (req, res) => {
  try {
    const { mealData } = req.body;
    if (!mealData) {
      return res.status(400).json({ error: "Meal data is required." });
    }
    await knex("favorite_meals").insert({ meal_data: JSON.stringify(mealData) });
    res.status(201).json({ message: "Meal added to favorites!" });
  } catch (error) {
    console.error("Error adding favorite meal:", error);
    res.status(500).json({ error: "Failed to add meal to favorites." });
  }
});

// New endpoint to remove a meal from favorites
app.post("/api/remove-favorite-meal", async (req, res) => {
  try {
    const { mealId } = req.body;
    if (!mealId) {
      return res.status(400).json({ error: "Meal ID is required." });
    }
    await knex("favorite_meals").where({ id: mealId }).del();
    res.status(200).json({ message: "Meal removed from favorites!" });
  } catch (error) {
    console.error("Error removing favorite meal:", error);
    res.status(500).json({ error: "Failed to remove meal from favorites." });
  }
});

// New endpoint to get all favorite meals
app.get("/api/get-favorite-meals", async (req, res) => {
  try {
    const favoriteMeals = await knex("favorite_meals").select("id", "meal_data", "created_at");
    const parsedFavoriteMeals = favoriteMeals.map(meal => ({
      id: meal.id,
      meal_data: JSON.parse(meal.meal_data),
      created_at: meal.created_at,
    }));
    res.status(200).json(parsedFavoriteMeals);
  } catch (error) {
    console.error("Error fetching favorite meals:", error);
    res.status(500).json({ error: "Failed to fetch favorite meals." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
