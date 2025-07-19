import http from "http";

function classifyPrompt(rawPrompt) {
  return `
Reply with exactly one label:  
IMPROVABLE / NEEDS_MORE_INFO / NON_IMPROVABLE
    SYSTEM: You are a prompt-type classifier for a developer support tool at a software company. Read each user prompt and assign exactly one of:

  • IMPROVABLE  
    - A standalone technical question about software concepts or best practices that can be made more precise (e.g. “What is X?”, “Explain Y”).  
  • NEEDS_MORE_INFO  
    - A request that shows intent but lacks the detail needed to act (e.g. “How do I fix this?”, “Optimize this service?” without code or metrics).  
  • NON_IMPROVABLE  
    - A prompt asking for hands-on review, debugging, or modification of user-provided artifacts (code, configs, logs, prose).

INSTRUCTIONS:
1. Output only one label: IMPROVABLE, NEEDS_MORE_INFO, or NON_IMPROVABLE.
2. Base your decision solely on the prompt text—do not assume unstated context.
3. For mixed-intent prompts (e.g. concept + code review), pick the dominant intent.
4. Blank or nonsensical prompts → NEEDS_MORE_INFO.

EXAMPLES:

— IMPROVABLE  
Q: “What is Kubernetes, and why use it?”  
Q: “Describe the SOLID principles in object-oriented design.”  
Q: “List best practices for PostgreSQL indexing.”  
Q: “Explain the difference between monolithic and microservices architectures.”

— NEEDS_MORE_INFO  
Q: “How can I improve my API's performance?”  
Q: “Why is my Node.js service throwing 503 errors?”  
Q: “Optimize this deployment.”  (no YAML or metrics provided)  
Q: “How do I secure my REST endpoints?”  (no framework or auth details)

— NON_IMPROVABLE  
Q: “Please refactor this Python function:  
\`\`\`  
def calculate(a, b): return a+b  
\`\`\`”  
Q: “Fix the null-pointer exception in this Java stack trace.”  
Q: “Review my Terraform config for AWS VPC.”  
Q: “Debug this Dockerfile—build keeps failing.”

— MIXED INTENT (choose dominant)  
Q: “What is Docker, and can you optimize my Dockerfile?” → NON_IMPROVABLE  
Q: “Explain event-driven architectures and their use cases.” → IMPROVABLE  

NOW: Read the user's prompt below. Reply with exactly one label:  
IMPROVABLE / NEEDS_MORE_INFO / NON_IMPROVABLE

——  
${rawPrompt}
`;
}

const RULES_PROMPT = `
You are a “Prompt Refinement Assistant.”  
Given a raw user question, you will:  
  1. Detect the primary domain or language by looking for keywords.  
  2. Assign reasonable defaults for “Environment/Version” and “Audience” based on that domain.  
  3. Populate the following template with those values and with the original question.  
 
Template to populate:  
Role: You are an expert in {{domain}}.  
 
Context:  
- Environment/Version: {{environment}}  
- Audience: {{audience}}  
 
Question:  
{{raw_question}}  
 
Requirements:  
1. {{req1}}  
2. {{req2}}  
3. {{req3}}  
 
Output:  
- {{output_format}}  
 
Steps:  
1. {{step1}}  
2. {{step2}}  
3. {{step3}}  

Always fill **all** slots. Infer sensible defaults when unspecified.  
Try to provide code examples wherever applicable.
Add more requirements and steps as you like and don't be lazy in response. 
Don't add irrelevant points but don't hold back on adding any important information to be required in the context that can improve the prompt.
Don't include images and illustrative examples in the prompt.
I am gonna give you a few examples to get familiar
The audience are exceptional Software engineers so adjust and information keeping that in mind
Make sure to include all the requirements to clearly explain the concept asked in the prompt. Don't miss anything.
Don't include non-technical information in the prompt, only use technically useful information.
`;

const EXAMPLE_INJECTIONS = `
Example 1:
Prompt :  How do I reverse string in C++.

Improved Prompt :

Role: You are an expert in C++.
 
Context:
- Environment/Version: GCC 12 on Linux or MSVC 2022 on Windows
- Audience: Developers familiar with basic C syntax
 
Question:
How do I reverse a string in C++?
 
Requirements:
1. Show in-place and std::reverse methods
2. Explain time/space complexity
3. Highlight edge cases (empty, single-char)
 
Output:
- Return a well formatted output.
 
Steps:
1. Outline approach
2. Provide code samples
3. Summarize pros/cons

Example 2:
Prompt: What is __name__ in python?

Improved Prompt
Role: You are an expert in Python.

Context:

* Environment/Version: Python 3.11+
* Audience: Experienced software engineers working in Oracle with proficiency in general programming concepts

Question:
What is __name__ in Python?

Requirements:

1. Explain the purpose and usage of the __name__ variable in Python scripts and modules
2. Illustrate how __name__ enables a module to act as both reusable code and a standalone program
3. Cover common patterns (if __name__ == "__main__":) and clarify its significance in module import and execution flow
4. Address nuances in package/module context and potential caveats in complex project structures
5. Provide minimal yet representative code examples to clarify the explanation
6. Briefly discuss best practices for leveraging __name__ in production codebases

Output:

* Return a clear, well-structured technical explanation with code snippets where appropriate

Steps:

1. Define what __name__ is and describe how Python assigns its value
2. Explain the standard idiom (if __name__ == "__main__":) with examples and reasoning
3. Describe the behavior when modules are imported versus run as a script
4. Highlight advanced details and any gotchas in real-world modular applications
5. Summarize best practices and key takeaways for expert usage

Example 3:
Prompt: Difference between let var and const in js.

Improved Prompt:
Role: You are an expert in JavaScript.

Context:

* Environment/Version: ECMAScript 2021 (ES12), modern browsers and Node.js 16+
* Audience: Experienced software engineers with a solid understanding of programming fundamentals, seeking precise technical details

Question:
What is the difference between let, var, and const in JavaScript?

Requirements:

1. Explain scope differences (function scope, block scope) among var, let, and const
2. Detail variable hoisting behavior for each declaration keyword and implications for temporal dead zone (TDZ)
3. Clarify mutability vs. re-assignment: distinguish between const and let in terms of assignment and mutation, including for objects and arrays
4. Include concise code snippets illustrating each concept and edge case
5. Summarize best practices and highlight common pitfalls or anti-patterns (e.g., accidental global variable creation, redeclaration)
6. Address usage in modern JavaScript and compatibility considerations

Output:

* Provide a well-organized technical explanation with relevant code examples, suitable for advanced developers

Steps:

1. Define var, let, and const with regard to scope and declaration semantics
2. Demonstrate hoisting and temporal dead zone behaviors with code samples
3. Contrast mutability, reassignment, and reference behavior using let and const (including for objects/arrays)
4. Outline best practices and caveats in production code
5. Conclude with guidance for selecting the appropriate declaration in different scenarios
`;

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

function ratingPrompt(rawPrompt) {
  return `
You are an expert prompt evaluator specializing in assessing the quality and effectiveness of language model prompts.

Your task is to evaluate the given prompt using two key criteria:

**EVALUATION CRITERIA:**

1. **Clarity** (Weight: 20%)
   - How clearly does the prompt communicate what is being asked?
   - Are the instructions unambiguous and easy to follow?
   - Is the language simple and accessible without jargon?
   - Are the expectations and desired outcomes clearly stated?

2. **Comprehensiveness** (Weight: 80%)
   - Does the prompt contain sufficient detail to guide an LLM effectively?
   - Is it specific enough to generate useful, focused responses?
   - Does it provide adequate context and constraints?
   - Are all necessary elements included for the task?

**SCORING SCALE:**
Rate each criterion on a scale of 1-5:
- 1 = Very Poor: Major deficiencies that severely impact effectiveness
- 2 = Poor: Significant issues that hinder performance
- 3 = Average: Adequate but with room for improvement
- 4 = Good: Well-executed with minor areas for enhancement
- 5 = Excellent: Exceptional quality with minimal flaws

**INSTRUCTIONS:**
1. Read the provided prompt carefully
2. Evaluate it against both criteria using the 1-5 scale
3. Calculate the overall score by averaging the two criterion scores
4. Round the final score to the nearest whole number
5. Provide ONLY the final integer score (1, 2, 3, 4, or 5)

**EXAMPLE EVALUATION PROCESS:**
- If Clarity = 4 and Comprehensiveness = 3
- Overall = (4 + 3) ÷ 2 = 3.5, rounded to 4

Now evaluate this prompt:

${rawPrompt}

Response format: Provide only the integer score.

IMPORTANT:
Reply with **ONLY one integer** — **1**, **2**, **3**, **4**, or **5**.  
Do **not** include any explanation or comment.
`;
}

async function runOllama({
  model,
  prompt,
  max_tokens = 512,
  temperature = 0.2,
}) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      max_tokens,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API error: ${response.status} ${response.statusText}`
    );
  }

  const json = await response.json();
  if (json.choices) return json.choices[0].text;
  if (json.results?.[0]?.choices) return json.results[0].choices[0].text;
  return JSON.stringify(json);
}

function parseOutput(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.response;
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
  const ratingText = await runOllama({
    model: "llama3.1:8b",
    prompt: ratingPrompt(rawPrompt),
  });
  const rating = parseOutput(ratingText).trim();
  console.log("Rating:", rating);


  return rating;
}

export async function improvePrompt(rawPrompt) {
  const classificationText = await runOllama({
    model: "llama3.1:8b",
    prompt: classifyPrompt(rawPrompt),
  });
  const status = parseOutput(classificationText).trim();
  console.log("Classification:", status);

  if (status !== "IMPROVABLE") {
    return rawPrompt;
  }

  const fewShot = buildFewShotPrompt(rawPrompt);
  const rawRefinement = await runOllama({
    model: "llama3.1:8b",
    prompt: fewShot,
  });
  return parseOutput(rawRefinement).trim();
}

const PORT = process.env.PORT || 8080;
const allowedOrigin = 'https://chatgpt.com'; // set this exactly

const server = http.createServer(async (req, res) => {

  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
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
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { prompt } = JSON.parse(body);
        if (!prompt) throw new Error('Missing "prompt" in request body');
        const promptRating = await calculatePerplexity(prompt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ promptRating }));
      } catch (err) {
        res.writeHead(err.message.includes("Missing") ? 400 : 500, { "Content-Type": "application/json" });
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
