require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function cleanAIResponse(text) {
    if (!text) return '';
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.substring(7).trim();
    }
    if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3).trim();
    }
    return cleanedText;
}

const getMealPlanPrompt = (payload) => {
    const { ingredientsText, cuisine, days, mealTypes, familySize } = payload;
    const ingredientsString = ingredientsText && ingredientsText.trim() !== '' 
        ? `The user has these ingredients: ${ingredientsText}. Prioritize using leftovers.` 
        : 'The user is starting from scratch; please generate a shopping list for all needed items.';
    
    // --- NEW, MORE FORCEFUL PROMPT ---
    return `
        You are an expert AI meal planner. Your primary goal is to generate a complete and detailed meal plan.
        
        **User's Request:**
        - Cuisine: ${cuisine}
        - Duration: ${days} days
        - Family Size: ${familySize} people
        - Requested Meals: ${mealTypes.join(', ')}
        - Available Ingredients: ${ingredientsString}

        **Your Task & Strict Rules:**
        1.  You MUST generate a meal plan for the exact number of days requested.
        2.  You MUST adhere to the user's cuisine preference.
        3.  All recipe quantities MUST be scaled to serve the specified family size.
        4.  **CRITICAL RULE:** For EVERY single meal object you generate (e.g., breakfast, lunch, dinner), you MUST include the following four fields: "title" (string), "ingredientsUsed" (array of strings), "missingIngredients" (array of strings, which can be an empty array `[]` if no ingredients are needed), and "instructions" (array of strings).
        5.  **NON-NEGOTIABLE:** Do NOT omit the "instructions" or "ingredientsUsed" fields for any meal. Every meal must have a recipe.

        **Output Format:**
        - Respond with ONLY a valid JSON object. Do not include any text before or after the JSON.
        - If generating a shopping list, the root object must be: \`{ "shopping_list": [...], "meal_plan": [...] }\`
        - Otherwise, the root object must be: \`{ "meal_plan": [...] }\`
    `;
};


app.post('/api/generate-plan', async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ error: 'Request body is missing.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = getMealPlanPrompt(req.body);

        const result = await model.generateContent(prompt);
        const cleanedText = cleanAIResponse(result.response.text());

        try {
            const parsedJson = JSON.parse(cleanedText);
            res.json(parsedJson);
        } catch (e) {
            console.error("Fatal Error: AI response could not be parsed as JSON. Response was:", cleanedText);
            res.status(500).json({ error: "The AI returned a response in an unreadable format. Please try again." });
        }

    } catch (error) {
        console.error('Error in /api/generate-plan:', error);
        res.status(500).json({ error: 'Failed to generate meal plan due to a server error.' });
    }
});


// The /api/generate-recipe endpoint remains the same as it was working correctly.
app.post('/api/generate-recipe', async (req, res) => {
    try {
        const { ingredientsText, recipeRequest, mealType, familySize = 1 } = req.body;

        if (!recipeRequest) return res.status(400).json({ error: 'A recipe request is required.' });

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const prompt = `
            You are an expert AI recipe creator. A user wants a recipe for "${recipeRequest}" to serve ${familySize} people.
            They have these ingredients: ${ingredientsText || 'none'}. This recipe is for ${mealType}.
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
        console.error('Error in /api/generate-recipe:', error);
        res.status(500).json({ error: 'Failed to generate recipe.' });
    }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
