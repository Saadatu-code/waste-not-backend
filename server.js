require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

const formatIngredients = (ingredientsText) => {
  if (!ingredientsText || ingredientsText.trim() === "") return "none";
  return ingredientsText;
};

// --- Endpoint for Mode 1: Meal Plan Generation ---
app.post("/api/generate-plan", async (req, res) => {
  try {
    const {
      ingredientsText,
      cuisine = "UK",
      days = 3,
      mealTypes = ["Breakfast", "Lunch", "Dinner"],
      familySize = 1,
    } = req.body;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let prompt;
    const baseInstructions = `
            You are an expert AI meal planner. A user is cooking for a family of ${familySize}.
            Generate a meal plan for ${days} days, focused on ${cuisine} cuisine, including meals for: ${mealTypes.join(
      ", "
    )}.
            All recipe quantities must be scaled for ${familySize} people.
            For EVERY meal generated, you MUST provide a "recipe" value as a clear, concise string of instructions. This field cannot be an object and is mandatory.
        `;

    if (!ingredientsText || ingredientsText.trim() === "") {
      prompt = `
                ${baseInstructions}
                The user is starting from scratch.
                First, generate a comprehensive shopping list for the entire meal plan.
                Then, generate the full meal plan as described.
                Respond with ONLY a valid JSON object in the format: 
                { "shopping_list": ["item 1", "item 2", ...], "meal_plan": [{"day": "Day 1", "breakfast": {"name": "...", "recipe": "..."}}, ...] }
            `;
    } else {
      prompt = `
                ${baseInstructions}
                The user has the following ingredients: ${formatIngredients(
                  ingredientsText
                )}.
                Prioritize using any ingredients marked as 'leftover'.
                Respond with ONLY a valid JSON object in the format: 
                { "meal_plan": [{"day": "Day 1", "breakfast": {"name": "...", "recipe": "..."}}, ...] }
            `;
    }

    const result = await model.generateContent(prompt);
    const cleanedText = cleanAIResponse(result.response.text());

    try {
      res.json(JSON.parse(cleanedText));
    } catch (e) {
      console.error("Error parsing JSON from AI:", cleanedText);
      throw new Error("AI did not return valid JSON.");
    }
  } catch (error) {
    console.error("Error in /api/generate-plan:", error);
    res.status(500).json({ error: "Failed to generate meal plan." });
  }
});

// --- Endpoint for Mode 2: Specific Recipe Generation ---
app.post("/api/generate-recipe", async (req, res) => {
  try {
    const {
      ingredientsText,
      recipeRequest,
      mealType,
      familySize = 1,
    } = req.body;

    if (!recipeRequest)
      return res.status(400).json({ error: "A recipe request is required." });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
            You are an expert AI recipe creator. A user wants a recipe for "${recipeRequest}" to serve ${familySize} people.
            They have these ingredients: ${formatIngredients(
              ingredientsText
            )}. This recipe is for ${mealType}.
            Generate a single, clear recipe, prioritizing the user's ingredients. Scale all quantities for ${familySize} people.
            The "ingredients" and "instructions" fields must be arrays of strings.
            If essential ingredients are missing, list them in a "shopping_list" array.
            Respond with ONLY a valid JSON object in the format:
            { "recipe": { "name": "Recipe Name", "description": "...", "ingredients": ["..."], "instructions": ["..."], "shopping_list": ["..."] } }
        `;

    const result = await model.generateContent(prompt);
    const cleanedText = cleanAIResponse(result.response.text());

    try {
      res.json(JSON.parse(cleanedText));
    } catch (e) {
      console.error("Error parsing JSON from AI:", cleanedText);
      throw new Error("AI did not return valid JSON.");
    }
  } catch (error) {
    console.error("Error in /api/generate-recipe:", error);
    res.status(500).json({ error: "Failed to generate recipe." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log("Ready to receive requests from the Waste-Not frontend!");
});
