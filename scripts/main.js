/**
 * GitHub Actions と GPT-4o による自動タスク進捗モニターとリマインドシステム
 *
 * このスクリプトは、GitHubリポジトリから情報を収集し、GPT-4oを使用して
 * リマインドメッセージとアクション提案を生成し、日次Issueに投稿します。
 * また、Issue内のドラフトセクションを検出し、子Issueとして作成することもできます。
 */

const {
  findOrCreateDailyIssue,
  postCommentToDailyIssue,
  processDrafts,
} = require("./manage_issues");
const { collectRepoData } = require("./collect_repo_data");
const { generateReminder } = require("./generate_reminder");

// Output helper for GitHub Actions
function setOutput(name, value) {
  // In GitHub Actions, outputs can be set using the GITHUB_OUTPUT environment file
  if (process.env.GITHUB_OUTPUT) {
    const fs = require("fs");
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${name}=${typeof value === "string" ? value : JSON.stringify(value)}\n`
    );
  }
  // For local testing or debugging
  console.log(`Output ${name}:`, value);
}

/**
 * Main function that orchestrates the entire task monitoring and reminder process.
 */
async function main() {
  console.log("Starting task monitoring and reminder process...");

  try {
    // Step 1: Find or create the daily issue
    console.log("Step 1: Finding or creating daily issue...");
    const dailyIssue = await findOrCreateDailyIssue();
    console.log(`Daily issue: #${dailyIssue.number} (${dailyIssue.html_url})`);

    // Step 2: Collect repository data (issues, PRs)
    console.log("Step 2: Collecting repository data...");
    const repoData = await collectRepoData();
    console.log(
      `Collected data: ${repoData.issues.length} issues, ${repoData.pulls.length} pull requests`
    );

    // Step 3: Generate reminder and action suggestions using GPT-4o
    console.log("Step 3: Generating reminder with GPT-4o...");
    const reminderData = await generateReminder(repoData);

    if (!reminderData) {
      console.error("Failed to generate reminder. Exiting process.");
      setOutput("reminder", "Generation failed");
      setOutput("action_suggestions", "Generation failed");
      setOutput("issue_url", dailyIssue.html_url);
      setOutput("sub_issues_processed", "0");
      return;
    }

    console.log("Generated reminder successfully.");
    setOutput("reminder", reminderData.reminder.substring(0, 100) + "..."); // Truncate for output
    setOutput(
      "action_suggestions",
      reminderData.action_suggestions.substring(0, 100) + "..."
    ); // Truncate for output

    // Step 4: Post the generated content as a comment to the daily issue
    console.log("Step 4: Posting reminder to daily issue...");
    const comment = await postCommentToDailyIssue(
      dailyIssue.number,
      reminderData
    );

    if (!comment) {
      console.error("Failed to post comment to daily issue.");
    } else {
      console.log(`Comment posted successfully: ${comment.html_url}`);
    }

    // Step 5: Process draft notes and create sub-issues if needed
    console.log("Step 5: Processing drafts from daily issue...");
    const draftsStats = await processDrafts(dailyIssue.number);

    console.log(`Drafts processing completed: ${JSON.stringify(draftsStats)}`);
    setOutput("issue_url", dailyIssue.html_url);
    setOutput("sub_issues_processed", JSON.stringify(draftsStats));

    console.log("Task monitoring and reminder process completed successfully.");
  } catch (error) {
    console.error("Error in task monitoring process:", error);

    // Set error outputs for GitHub Actions
    setOutput("error", error.message);

    // Exit with error code if running in a CI environment
    if (process.env.CI) {
      process.exit(1);
    }
  }
}

// Execute the main function
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error in main process:", error);
    if (process.env.CI) {
      process.exit(1);
    }
  });
}

// Export for testing or external use
module.exports = { main };
