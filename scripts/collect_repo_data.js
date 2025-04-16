const { initializeOctokit, retry } = require("./utils");

// --- Constants ---
const TARGET_REPO_OWNER =
  process.env.TARGET_REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER;
const TARGET_REPO_NAME =
  process.env.TARGET_REPO_NAME || process.env.GITHUB_REPOSITORY?.split("/")[1];
const MAX_ITEMS_PER_TYPE = 50; // Limit the number of issues/PRs fetched to avoid excessive API usage/costs

/**
 * Collects recent open issues and pull requests from the target repository.
 * @returns {Promise<{issues: Array<object>, pulls: Array<object>}>} An object containing arrays of issues and pull requests.
 */
async function collectRepoData() {
  if (!TARGET_REPO_OWNER || !TARGET_REPO_NAME) {
    throw new Error("Target repository owner or name is not defined.");
  }

  const octokit = initializeOctokit();
  const repoDetails = { owner: TARGET_REPO_OWNER, repo: TARGET_REPO_NAME };

  console.log(
    `Collecting repository data for ${TARGET_REPO_OWNER}/${TARGET_REPO_NAME}...`
  );

  try {
    // Fetch open issues (excluding pull requests)
    // Fetch recent ones, sorted by update time
    const { data: issues } = await retry(
      () =>
        octokit.rest.issues.listForRepo({
          ...repoDetails,
          state: "open",
          sort: "updated",
          direction: "desc",
          per_page: MAX_ITEMS_PER_TYPE,
        }),
      3,
      1000,
      "listIssuesForRepo"
    );

    // Filter out pull requests from the issues list
    const openIssues = issues.filter((issue) => !issue.pull_request);
    console.log(`Fetched ${openIssues.length} open issues.`);

    // Fetch open pull requests
    const { data: pulls } = await retry(
      () =>
        octokit.rest.pulls.list({
          ...repoDetails,
          state: "open",
          sort: "updated",
          direction: "desc",
          per_page: MAX_ITEMS_PER_TYPE,
        }),
      3,
      1000,
      "listPulls"
    );
    console.log(`Fetched ${pulls.length} open pull requests.`);

    // Simplify the data structure for GPT-4o (optional, but recommended)
    const simplifiedIssues = openIssues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      labels: issue.labels.map((label) => label.name),
      // Add assignee, comments_url etc. if needed by the prompt
    }));

    const simplifiedPulls = pulls.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      labels: pr.labels.map((label) => label.name),
      draft: pr.draft,
      // Add requested reviewers, checks status etc. if needed
    }));

    return {
      issues: simplifiedIssues,
      pulls: simplifiedPulls,
    };
  } catch (error) {
    console.error("Error collecting repository data:", error);
    throw error;
  }
}

// Example usage (for potential local testing)
/*
if (require.main === module) {
  (async () => {
    try {
      const data = await collectRepoData();
      console.log('Collected Data:');
      console.log('Issues:', JSON.stringify(data.issues, null, 2));
      console.log('Pulls:', JSON.stringify(data.pulls, null, 2));
    } catch (error) {
      console.error('Failed to run collectRepoData:', error);
      process.exit(1);
    }
  })();
}
*/

module.exports = {
  collectRepoData,
};
