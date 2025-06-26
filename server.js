require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

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

// --- PROMPT GENERATION FUNCTIONS ---

const getIngredientsPrompt = (payload) => {
  const { ingredientsText, mealTypes, cuisine, dietaryType, days, familySize } = payload;
  return `
    You are an expert AI meal planner. Generate a multi-day meal plan based on the user\'s ingredients.
    User\'s Request:
    - Ingredients: ${ingredientsText}. Prioritize items with expiry dates.
    - Meal Types: ${mealTypes.join(", ")}
    - Cuisine: ${cuisine}
    - Dietary Needs: ${dietaryType}
    - Duration: ${days} days
    - Family Size: ${familySize} people
    Your Task & Strict Rules:
    1.  Generate a meal plan for the exact number of days requested.
    2.  For EVERY meal, you MUST include: "title", "cuisine", "healthTag", "ingredientsUsed", "missingIngredients", and "instructions".
    3.  Respond with ONLY a valid JSON object in the format: { "type": "meal_plan", "data": [{...mealObject...}] }
  `;
};

const getPlanFromScratchPrompt = (payload) => {
  const { mealTypes, duration, cuisine, dietaryType, healthGoal, familySize } = payload;
  return `
    You are an expert AI meal planner. Generate a meal plan and a smart, categorized shopping list.
    User\'s Request:
    - Meal Types: ${mealTypes.join(", ")}
    - Duration: ${duration} days
    - Cuisine: ${cuisine}
    - Dietary Needs: ${dietaryType}
    - Health Goal: ${healthGoal}
    - Family Size: ${familySize} people
    Your Task & Strict Rules:
    1.  Generate a meal plan and a categorized shopping list.
    2.  For EVERY meal, you MUST include: "title", "cuisine", "healthTag", "ingredientsUsed", "missingIngredients", and "instructions".
    3.  The shopping list must be categorized (e.g., "Produce", "Protein", "Dairy").
    4.  Respond with ONLY a valid JSON object in the format: { "type": "shopping_list_plan", "shoppingList": {"category": ["item1", ...]}, "mealPlan": [{...mealObject...}] }
  `;
};

const getRecipePrompt = (payload) => {
  const { ingredientsText, mealName } = payload;
  const request = mealName ? `for "${mealName}"` : `using the ingredients provided`;
  return `
    You are an expert AI recipe creator. Generate a recipe ${request}.
    User\'s Request:
    - Ingredients: ${ingredientsText || "None"}
    - Meal Name: ${mealName || "Not specified"}
    Your Task & Strict Rules:
    1.  Generate a single, clear recipe.
    2.  The recipe object MUST contain: "title", "cuisine", "ingredients", "instructions", and "nutritionInfo".
    3.  Respond with ONLY a valid JSON object in the format: { "type": "single_recipe", "data": {...recipeObject...} }
  `;
};

// --- API ENDPOINTS ---

async function handleApiRequest(req, res, getPrompt, endpointName) {
  try {
    if (!req.body) {
      return res.status(400).json({ error: "Request body is missing." });
    }
    const prompt = getPrompt(req.body);
    const result = await model.generateContent(prompt);
    const cleanedText = cleanAIResponse(result.response.text());

    try {
      const parsedJson = JSON.parse(cleanedText);
      res.json(parsedJson);
    } catch (e) {
      console.error(`Fatal Error at ${endpointName}: AI response could not be parsed. Response was:`, cleanedText);
      res.status(500).json({ error: "The AI returned a response in an unreadable format." });
    }
  } catch (error) {
    console.error(`Error in ${endpointName}:`, error);
    res.status(500).json({ error: `Failed to generate response due to a server error.` });
  }
}

app.post("/api/generate-from-ingredients", (req, res) => {
  handleApiRequest(req, res, getIngredientsPrompt, "/api/generate-from-ingredients");
});

app.post("/api/plan-from-scratch", (req, res) => {
  handleApiRequest(req, res, getPlanFromScratchPrompt, "/api/plan-from-scratch");
});

app.post("/api/find-recipe", (req, res) => {
  handleApiRequest(req, res, getRecipePrompt, "/api/find-recipe");
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});