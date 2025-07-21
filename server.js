import http from "http";
import "dotenv/config";
import {
  EXAMPLE_INJECTIONS,
  RULES_PROMPT,
  classifyPrompt,
  ratingPrompt,
} from "./utils.js";

import * as generativeaiinference from "oci-generativeaiinference";
import common from "oci-common";
const configurationFilePath = "~/.oci/config";
const configProfile = "EREN";
const provider = new common.ConfigFileAuthenticationDetailsProvider(
  configurationFilePath,
  configProfile
);

function getRulesPrompt() {
  return RULES_PROMPT.trim();
}

function getExamplePrompts() {
  return EXAMPLE_INJECTIONS.trim();
}

function buildFewShotPrompt(rawPrompt) {
  return [
    getRulesPrompt(),
    getExamplePrompts(),
    `Now refine this raw question into the populated template:
${rawPrompt}`,
  ].join("\n\n");
}

async function runOCI({ model, prompt }) {
  try {
    const client = new generativeaiinference.GenerativeAiInferenceClient({
      authenticationDetailsProvider: provider,
    });

    // Create a request and dependent object(s).
    const chatDetails = {
      compartmentId: process.env.COMPARTMENT_OCID,
      servingMode: {
        servingType: "ON_DEMAND",
        modelId: model,
      },
      chatRequest: {
        apiFormat: "COHERE",
        message: prompt,
        isStream: false,
        maxTokens: 4000,
      },
    };

    const chatRequest = {
      chatDetails: chatDetails,
    };
    const chatResponse = await client.chat(chatRequest);
    return chatResponse;
  } catch (error) {
    console.log("chat Failed with error  " + error);
  }
}

function parseOutput(text) {
  try {
    return text.chatResult.chatResponse.text;
  } catch {
    return text;
  }
}

// GPT Supports this, OLLAMA doesn't

/*
async function calculatePerplexity(prompt, model = "llama3.1:8b") {
  console.log("in calculatePerplexity")
  console.log("prompt: " + prompt)

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "llama3.1:8b",
      prompt,
      max_tokens: 0, 
      temperature: 0,
      logprobs: true,
    }),
  });

  if (!response.ok) throw new Error('Ollama API error');

  const data = await response.json();

  // You need to adjust the logic here based on actual API response shape
  const tokens = data.tokens || [];
  if (!tokens.length) throw new Error('No token logprobs returned');

  let nlls = [];
  for (const tokenObj of tokens) {
    let negLogLikelihood = tokenObj.logprob;
    if (negLogLikelihood == null) negLogLikelihood = -100;
    nlls.push(-negLogLikelihood); // Usually logprob is negative; adjust as needed
  }

  const perplexity = Math.exp(nlls.reduce((a, b) => a + b, 0) / nlls.length);
  console.log("perplexity calculate: "+ perplexity)
  return perplexity;
}
*/

export async function calculatePerplexity(rawPrompt) {
  // LLM-as-a-Judge approach, untill logprobs approach is sorted
  const ratingText = await runOCI({
    model: "cohere.command-latest",
    prompt: ratingPrompt(rawPrompt),
  });
  const rating = parseOutput(ratingText).trim();
  console.log("Rating:", rating);

  return rating;
}

export async function improvePrompt(rawPrompt) {
  const classificationText = await runOCI({
    model: "cohere.command-latest",
    prompt: classifyPrompt(rawPrompt),
  });
  const status = parseOutput(classificationText).trim();

  console.log("Classification:", status);

  if (status !== "IMPROVABLE") {
    return rawPrompt;
  }

  const fewShot = buildFewShotPrompt(rawPrompt);
  const rawRefinement = await runOCI({
    model: "cohere.command-latest",
    prompt: fewShot,
  });
  return parseOutput(rawRefinement).trim();
}

const PORT = process.env.PORT || 8080;
const allowedOrigin = "https://chatgpt.com"; // set this exactly

const server = http.createServer(async (req, res) => {
  // Set CORS headers for all requests
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/improve") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { prompt: rawPrompt } = JSON.parse(body);
        if (!rawPrompt) throw new Error('Missing "prompt" in request body');
        const improvedPrompt = await improvePrompt(rawPrompt);
        const responseBody = JSON.stringify({ improvedPrompt });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(responseBody);
      } catch (err) {
        res.writeHead(err.message.includes("Missing") ? 400 : 500, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.method === "POST" && req.url === "/perplexity") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { prompt } = JSON.parse(body);
        if (!prompt) throw new Error('Missing "prompt" in request body');
        const promptRating = await calculatePerplexity(prompt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ promptRating }));
      } catch (err) {
        res.writeHead(err.message.includes("Missing") ? 400 : 500, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(PORT, () => {
  console.log(`Prompt Improver API listening on port ${PORT}`);
});
