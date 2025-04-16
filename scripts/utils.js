const { Octokit } = require("@octokit/rest");
const { OpenAI } = require("openai");
require("dotenv").config();

/**
 * Initializes the Octokit client for GitHub API interaction.
 * @returns {Octokit} An authenticated Octokit instance.
 */
function initializeOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set in environment variables.");
  }
  return new Octokit({ auth: token });
}

/**
 * Initializes the OpenAI client.
 * @returns {OpenAI} An authenticated OpenAI instance.
 */
function initializeOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables.");
  }
  return new OpenAI({ apiKey });
}

/**
 * Simple sleep function.
 * @param {number} ms Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A simple retry mechanism for asynchronous functions.
 * @template T
 * @param {() => Promise<T>} fn The function to retry.
 * @param {number} retries Maximum number of retries.
 * @param {number} delay Milliseconds to wait between retries.
 * @param {string} operationName Name of the operation for logging.
 * @returns {Promise<T>}
 */
async function retry(
  fn,
  retries = 3,
  delay = 1000,
  operationName = "operation"
) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempt ${i + 1} for ${operationName}...`);
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(
        `Attempt ${i + 1} for ${operationName} failed: ${error.message}`
      );
      if (i < retries - 1) {
        console.log(`Retrying ${operationName} in ${delay}ms...`);
        await sleep(delay);
      } else {
        console.error(`All ${retries} attempts for ${operationName} failed.`);
      }
    }
  }
  throw lastError; // Re-throw the last error after all retries fail
}

/**
 * Gets the current date in YYYY-MM-DD format (UTC).
 * @returns {string} The current date string.
 */
function getCurrentDateUTC() {
  return new Date().toISOString().split("T")[0];
}

module.exports = {
  initializeOctokit,
  initializeOpenAI,
  retry,
  getCurrentDateUTC,
  sleep, // Export sleep if needed elsewhere, though retry uses it internally
};
