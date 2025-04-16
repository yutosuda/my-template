const { initializeOpenAI, retry } = require("./utils");

// --- Constants ---
const GPT_MODEL = process.env.GPT_MODEL || "gpt-4o"; // Or specify another model like "gpt-4-turbo"
const GPT_TEMPERATURE = parseFloat(process.env.GPT_TEMPERATURE || "0.2");
const MAX_TOKENS = 1500; // Adjust as needed, balance between detail and cost

/**
 * Generates a reminder and action suggestions using GPT-4o based on repository data.
 * @param {object} repoData Data collected from the repository (issues, pulls).
 * @returns {Promise<{reminder: string, action_suggestions: string} | null>} The generated content or null if an error occurs.
 */
async function generateReminder(repoData) {
  const openai = initializeOpenAI();

  // Construct the prompt based on the requirements
  const promptContent = `
あなたは卓越したプロジェクトマネージャーであり、洞察力に富んだ詩人でもあります。
以下は、監視対象リポジトリの現在のタスク状況の概要です。オープンなIssueとPull Requestの情報を示します：

\`\`\`json
${JSON.stringify(repoData, null, 2)}
\`\`\`

この情報を基に、チームメンバーが状況を把握し、次の一歩を踏み出すためのインスピレーションを得られるように、以下のタスクを実行してください：

1.  **リマインドメッセージの生成**: 現在の状況（活発さ、停滞している点、注目すべき進捗など）を要約し、哲学的かつ詩的な、優しく知的なトーンで表現してください。単なる事実の列挙ではなく、状況に対する洞察や励ましを込めてください。
2.  **アクション提案の生成**: 上記の状況を踏まえ、具体的な次のアクションや考慮すべき点を提案してください。提案には、その根拠、理由、関連する背景知識（例えば、特定のIssueの解決策のヒント、PRレビューの観点、効率的なタスク管理手法など）を詳細に含めてください。

出力は、以下のJSON形式で、キーは英語、値は日本語で記述してください：
\`\`\`json
{
  "reminder": "（ここに、上記の指示に従って生成された、哲学的で詩的なリマインドメッセージが入ります）",
  "action_suggestions": "（ここに、上記の指示に従って生成された、詳細な根拠・理由・背景知識付きのアクション提案が入ります）"
}
\`\`\`

注意点：
- 出力は必ず上記のJSON形式に従ってください。
- reminderとaction_suggestionsの値は日本語で記述してください。
- 全体として、協調的で前向きな姿勢を保ってください。
`;

  console.log(
    `Generating reminder using ${GPT_MODEL} with temperature ${GPT_TEMPERATURE}...`
  );

  try {
    const completion = await retry(
      async () => {
        const response = await openai.chat.completions.create({
          model: GPT_MODEL,
          messages: [
            {
              role: "system",
              content:
                "あなたは、GitHubリポジトリの状況を分析し、チームに進捗を促すための洞察を提供するAIアシスタントです。出力は指示されたJSON形式に従う必要があります。",
            },
            { role: "user", content: promptContent },
          ],
          temperature: GPT_TEMPERATURE,
          max_tokens: MAX_TOKENS,
          response_format: { type: "json_object" }, // Ensure JSON output
        });
        return response;
      },
      3,
      2000,
      "openaiChatCompletion"
    ); // Longer delay for API calls

    const messageContent = completion.choices[0]?.message?.content;

    if (!messageContent) {
      console.error("GPT-4o returned an empty message content.");
      return null;
    }

    console.log("Received raw response from GPT-4o:", messageContent);

    // Validate and parse the JSON response
    try {
      const parsedJson = JSON.parse(messageContent);
      // Basic validation of expected keys
      if (
        typeof parsedJson.reminder === "string" &&
        typeof parsedJson.action_suggestions === "string"
      ) {
        console.log("Successfully parsed GPT-4o response.");
        return parsedJson;
      } else {
        console.error(
          "GPT-4o response did not contain the expected keys ('reminder', 'action_suggestions')."
        );
        console.error("Parsed JSON:", parsedJson);
        return null;
      }
    } catch (parseError) {
      console.error("Failed to parse JSON response from GPT-4o:", parseError);
      console.error("Raw response was:", messageContent);
      return null;
    }
  } catch (error) {
    console.error(`Error calling OpenAI API (${GPT_MODEL}):`, error);
    // Log specific API error details if available
    if (error.response) {
      console.error("API Error Status:", error.response.status);
      console.error("API Error Data:", error.response.data);
    } else {
      console.error("Error details:", error.message);
    }
    return null; // Return null instead of throwing to allow the workflow to potentially continue
  }
}

// Example usage (for potential local testing)
/*
if (require.main === module) {
  (async () => {
    // Mock repo data for testing
    const mockData = {
      issues: [
        { number: 1, title: "Fix login bug", state: "open", updatedAt: "2024-08-14T10:00:00Z", labels: ["bug"] },
        { number: 2, title: "Implement feature X", state: "open", updatedAt: "2024-08-15T09:30:00Z", labels: ["feature"] },
      ],
      pulls: [
        { number: 3, title: "Refactor database module", state: "open", updatedAt: "2024-08-15T11:00:00Z", labels: ["refactor"], draft: false },
      ],
    };
    try {
      const result = await generateReminder(mockData);
      if (result) {
        console.log("Generated Content:");
        console.log("Reminder:", result.reminder);
        console.log("Action Suggestions:", result.action_suggestions);
      } else {
        console.log("Failed to generate reminder.");
      }
    } catch (error) {
      console.error("Failed to run generateReminder:", error);
      process.exit(1);
    }
  })();
}
*/

module.exports = {
  generateReminder,
};
