const { initializeOctokit, getCurrentDateUTC, retry } = require("./utils");

// --- Constants --- (Consider moving to a config file or env vars)
const TARGET_REPO_OWNER =
  process.env.TARGET_REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER; // Get owner from env or context
const TARGET_REPO_NAME =
  process.env.TARGET_REPO_NAME || process.env.GITHUB_REPOSITORY?.split("/")[1]; // Get repo name from env or context
const DAILY_ISSUE_LABEL = "daily-task-summary"; // Label to easily find daily issues
const DAILY_ISSUE_TITLE_PREFIX = "Task Status"; // Prefix for the daily issue title
const DRAFT_SECTION_HEADER = "## メモ・下書き"; // Marker for the drafts section in the daily issue
const SUB_ISSUE_LABEL = "sub-issue"; // Label for issues created from drafts

/**
 * Finds an existing daily issue for the current date or creates a new one.
 * Uses a specific label and title format for identification.
 * @returns {Promise<{number: number, html_url: string}>} The issue number and URL.
 */
async function findOrCreateDailyIssue() {
  if (!TARGET_REPO_OWNER || !TARGET_REPO_NAME) {
    throw new Error(
      "Target repository owner or name is not defined. Set TARGET_REPO_OWNER and TARGET_REPO_NAME environment variables or ensure GITHUB_REPOSITORY is available."
    );
  }

  const octokit = initializeOctokit();
  const today = getCurrentDateUTC();
  const expectedTitle = `${DAILY_ISSUE_TITLE_PREFIX} ${today}`;

  console.log(
    `Searching for daily issue: "${expectedTitle}" in ${TARGET_REPO_OWNER}/${TARGET_REPO_NAME} with label "${DAILY_ISSUE_LABEL}"`
  );

  try {
    // Search for the issue by label and title components
    // Note: Searching by exact title isn't directly supported efficiently.
    // We search by label and then filter results. Searching open issues is usually faster.
    const { data: issues } = await retry(
      () =>
        octokit.rest.issues.listForRepo({
          owner: TARGET_REPO_OWNER,
          repo: TARGET_REPO_NAME,
          labels: DAILY_ISSUE_LABEL,
          state: "open", // Only search open issues
        }),
      3,
      1000,
      "listIssuesForRepo"
    );

    const existingIssue = issues.find((issue) => issue.title === expectedTitle);

    if (existingIssue) {
      console.log(`Found existing daily issue: #${existingIssue.number}`);
      return { number: existingIssue.number, html_url: existingIssue.html_url };
    }

    // --- Issue not found, create it ---
    console.log(
      `Daily issue not found. Creating new issue: "${expectedTitle}"`
    );

    const issueBody = `# ${expectedTitle}\n\nThis issue automatically tracks tasks and reminders for ${today}.\n\nPlease add any relevant notes or drafts below under the designated sections.\n\n## Reminders & Suggestions\n\n*No updates yet.*\n\n## Metrics & Status\n\n*No updates yet.*\n\n${DRAFT_SECTION_HEADER}\n\n<!-- Add any draft notes or task ideas here. They will be processed into sub-issues if needed. -->\n\n`;

    const { data: newIssue } = await retry(
      () =>
        octokit.rest.issues.create({
          owner: TARGET_REPO_OWNER,
          repo: TARGET_REPO_NAME,
          title: expectedTitle,
          body: issueBody,
          labels: [DAILY_ISSUE_LABEL],
        }),
      3,
      1500,
      "createIssue"
    );

    console.log(`Created new daily issue: #${newIssue.number}`);
    return { number: newIssue.number, html_url: newIssue.html_url };
  } catch (error) {
    console.error("Error finding or creating daily issue:", error);
    throw error; // Re-throw the error to halt the workflow if needed
  }
}

/**
 * Posts a comment to the daily issue with reminder and action suggestions.
 * @param {number} issueNumber - The number of the daily issue.
 * @param {object} reminderData - The reminder and action suggestions object.
 * @returns {Promise<{id: number, html_url: string} | null>} The comment ID and URL, or null if failed.
 */
async function postCommentToDailyIssue(issueNumber, reminderData) {
  if (!TARGET_REPO_OWNER || !TARGET_REPO_NAME) {
    throw new Error("Target repository owner or name is not defined.");
  }

  if (!issueNumber) {
    throw new Error("Issue number is required to post a comment.");
  }

  if (
    !reminderData ||
    !reminderData.reminder ||
    !reminderData.action_suggestions
  ) {
    throw new Error(
      "Reminder data with 'reminder' and 'action_suggestions' is required."
    );
  }

  const octokit = initializeOctokit();
  const now = new Date().toISOString();

  try {
    const commentBody = `### 🕒 自動タスク更新 (${now})

#### 🌟 リマインド

${reminderData.reminder}

#### 🔍 アクション提案

${reminderData.action_suggestions}

---
*この更新は自動的に生成されています。アクションや提案は参考としてご活用ください。*`;

    console.log(`Posting comment to issue #${issueNumber}...`);

    const { data: comment } = await retry(
      () =>
        octokit.rest.issues.createComment({
          owner: TARGET_REPO_OWNER,
          repo: TARGET_REPO_NAME,
          issue_number: issueNumber,
          body: commentBody,
        }),
      3,
      1500,
      "createComment"
    );

    console.log(
      `Successfully posted comment #${comment.id} to issue #${issueNumber}`
    );
    return { id: comment.id, html_url: comment.html_url };
  } catch (error) {
    console.error(`Error posting comment to issue #${issueNumber}:`, error);
    if (error.response) {
      console.error("API Error Status:", error.response.status);
      console.error("API Error Data:", error.response.data);
    }
    return null; // Return null to allow the workflow to continue
  }
}

/**
 * Processes draft notes from the daily issue and converts them to sub-issues if needed.
 * Adds a comment asking for confirmation before creating sub-issues if no confirmation exists.
 * @param {number} issueNumber - The number of the daily issue.
 * @returns {Promise<{processed: number, created: number, existed: number}>} - Statistics about the processed drafts.
 */
async function processDrafts(issueNumber) {
  if (!TARGET_REPO_OWNER || !TARGET_REPO_NAME) {
    throw new Error("Target repository owner or name is not defined.");
  }

  if (!issueNumber) {
    throw new Error("Issue number is required to process drafts.");
  }

  const octokit = initializeOctokit();
  const stats = { processed: 0, created: 0, existed: 0 };

  try {
    // Get the current issue content
    console.log(`Fetching issue #${issueNumber} to check for drafts...`);

    const { data: issue } = await retry(
      () =>
        octokit.rest.issues.get({
          owner: TARGET_REPO_OWNER,
          repo: TARGET_REPO_NAME,
          issue_number: issueNumber,
        }),
      3,
      1000,
      "getIssue"
    );

    // Check if there's a drafts section
    const issueBody = issue.body || "";
    const draftSectionIndex = issueBody.indexOf(DRAFT_SECTION_HEADER);

    if (draftSectionIndex === -1) {
      console.log(
        `No "${DRAFT_SECTION_HEADER}" section found in issue #${issueNumber}.`
      );
      return stats;
    }

    // Extract text from the draft section (everything after the header until the next section or end)
    const draftText = issueBody.substring(
      draftSectionIndex + DRAFT_SECTION_HEADER.length
    );
    const nextSectionIndex = draftText.indexOf("##");
    const draftsContent =
      nextSectionIndex !== -1
        ? draftText.substring(0, nextSectionIndex).trim()
        : draftText.trim();

    if (!draftsContent || draftsContent.includes("<!-- Add any draft notes")) {
      console.log(
        "No draft content found or only contains the default comment placeholder."
      );
      return stats;
    }

    // Get all comments to check for confirmations
    const { data: comments } = await retry(
      () =>
        octokit.rest.issues.listComments({
          owner: TARGET_REPO_OWNER,
          repo: TARGET_REPO_NAME,
          issue_number: issueNumber,
        }),
      3,
      1000,
      "listComments"
    );

    // Extract potential draft items (bullet points or numbered lists)
    const draftLines = draftsContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.match(/^(-|\*|\d+\.)\s+.+/)); // Match bullet or numbered list items

    stats.processed = draftLines.length;

    if (draftLines.length === 0) {
      console.log(
        "No draft items found in the expected format (bullet points or numbered lists)."
      );
      return stats;
    }

    console.log(`Found ${draftLines.length} potential draft items.`);

    // Check if we already have a confirmation comment from the bot
    const confirmationComment = comments.find(
      (comment) =>
        comment.body.includes("下書きセクションからの子Issueの作成") &&
        comment.user.type === "Bot"
    );

    if (!confirmationComment) {
      // No confirmation yet, post a comment asking for confirmation
      const confirmationBody = `### 下書きセクションからの子Issueの作成

下書きセクションに ${
        draftLines.length
      } 件の項目が見つかりました。これらを子Issueとして作成しますか？
作成する場合は、このコメントに 👍 (thumbs up) リアクションを追加してください。

**下書き項目一覧:**
${draftLines.map((line, i) => `${i + 1}. ${line}`).join("\n")}

*注: リアクションが追加されるまで、自動的に子Issueは作成されません。*`;

      const { data: newComment } = await retry(
        () =>
          octokit.rest.issues.createComment({
            owner: TARGET_REPO_OWNER,
            repo: TARGET_REPO_NAME,
            issue_number: issueNumber,
            body: confirmationBody,
          }),
        3,
        1500,
        "createConfirmationComment"
      );

      console.log(`Created confirmation request comment #${newComment.id}.`);
      return stats; // Return early, wait for confirmation
    }

    // If we have a confirmation comment, check if it has a thumbs up reaction
    const { data: reactions } = await retry(
      () =>
        octokit.rest.reactions.listForIssueComment({
          owner: TARGET_REPO_OWNER,
          repo: TARGET_REPO_NAME,
          comment_id: confirmationComment.id,
        }),
      3,
      1000,
      "listReactions"
    );

    const hasThumbsUp = reactions.some((reaction) => reaction.content === "+1");

    if (!hasThumbsUp) {
      console.log("Confirmation comment exists but no thumbs up reaction yet.");
      return stats;
    }

    console.log(
      "Found confirmation with thumbs up reaction. Processing drafts to sub-issues..."
    );

    // Process each draft item into a sub-issue
    for (const draft of draftLines) {
      // Extract the draft title (remove the bullet/number prefix)
      const draftTitle = draft.replace(/^(-|\*|\d+\.)\s+/, "").trim();

      // Skip if empty
      if (!draftTitle) continue;

      // Check if a similar issue already exists to prevent duplicates
      const { data: existingIssues } = await retry(
        () =>
          octokit.rest.issues.listForRepo({
            owner: TARGET_REPO_OWNER,
            repo: TARGET_REPO_NAME,
            state: "open",
          }),
        3,
        1000,
        "checkExistingIssues"
      );

      const issueExists = existingIssues.some(
        (existingIssue) =>
          existingIssue.title.toLowerCase() === draftTitle.toLowerCase() ||
          existingIssue.title.toLowerCase().includes(draftTitle.toLowerCase())
      );

      if (issueExists) {
        console.log(
          `Similar issue for "${draftTitle}" already exists. Skipping.`
        );
        stats.existed++;
        continue;
      }

      // Create sub-issue
      try {
        const today = getCurrentDateUTC();
        const issueBody = `### 背景
この Issue は、[${DAILY_ISSUE_TITLE_PREFIX} ${today} (#${issueNumber})](${issue.html_url}) の下書きセクションから自動生成されました。

### 詳細
${draftTitle}

### 親Issue
#${issueNumber}
`;

        const { data: newIssue } = await retry(
          () =>
            octokit.rest.issues.create({
              owner: TARGET_REPO_OWNER,
              repo: TARGET_REPO_NAME,
              title: draftTitle,
              body: issueBody,
              labels: [SUB_ISSUE_LABEL],
            }),
          3,
          1500,
          "createSubIssue"
        );

        console.log(`Created sub-issue #${newIssue.number}: "${draftTitle}"`);
        stats.created++;

        // Add a reference comment back to the parent issue
        await retry(
          () =>
            octokit.rest.issues.createComment({
              owner: TARGET_REPO_OWNER,
              repo: TARGET_REPO_NAME,
              issue_number: issueNumber,
              body: `サブIssue 「${draftTitle}」を作成しました: #${newIssue.number}`,
            }),
          3,
          1500,
          "createReferenceComment"
        );
      } catch (subIssueError) {
        console.error(
          `Error creating sub-issue for "${draftTitle}":`,
          subIssueError
        );
        // Continue with other drafts even if one fails
      }
    }

    console.log(`Draft processing complete. Stats: ${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    console.error(`Error processing drafts from issue #${issueNumber}:`, error);
    if (error.response) {
      console.error("API Error Status:", error.response.status);
      console.error("API Error Data:", error.response.data);
    }
    return stats; // Return current stats, allowing the workflow to continue
  }
}

module.exports = {
  findOrCreateDailyIssue,
  postCommentToDailyIssue,
  processDrafts,
};
