// prompt_improver_pipeline.js
// If using Node.js ≥18, you can remove this line

/**
 * Build the few-shot template for the Prompt Improver.
 */

// step -> informational prompts

function classifyPrompt(rawPrompt){
    return `
    You’re a classifier that labels user prompts as one of:
- “IMPROVABLE” (straightforward informational Q&A that can be enhanced with context),

Examples:

Q: “What is C++?”  
A: IMPROVABLE

Q: “Explain promises in JavaScript.”  
A: IMPROVABLE

Q: “List best practices for React state management.”  
A: IMPROVABLE

Q: “Describe the Observer pattern.”  
A: IMPROVABLE

Now classify this prompt (respond with exactly one label):  Responde in One label, no less no more.
${rawPrompt}
`
}
function buildTemplate(rawPrompt) {
  return `You are a “Prompt Refinement Assistant.”  
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
 
I am gonna give you a few examples to get familiar

Example 1:
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

 
Steps:
1. Outline approach
2. Provide code samples
3. Summarize pros/cons

Now refine this raw question into the populated template:  
${rawPrompt}
`
}

/**
 * Call Ollama's local /api/generate endpoint to get a completion.
 */
async function runOllama({ model, prompt, max_tokens = 512, temperature = 0.2 }) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, max_tokens, temperature, stream: false })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  // Adjust parsing based on your Ollama version:
  if (json.choices) {
    return json.choices[0].text;
  }
  if (json.results && json.results[0].choices) {
    return json.results[0].choices[0].text;
  }
  return JSON.stringify(json);
}

/**
 * Parse the model's raw text output to extract the improved prompt.
 */
function parseOutput(text) {
  const parts = JSON.parse(text);
  return parts.response;
}

/**
 * Full pipeline: ingest raw prompt → improve → return.
 */
export async function improvePrompt(rawPrompt) {
  let promptStatus = await runOllama({ model: 'llama3.2:1b', prompt: classifyPrompt(rawPrompt)});
  console.log('Sta' , promptStatus);
    promptStatus = parseOutput(promptStatus);
  let template;
  console.log('Status : ', promptStatus);
  if(promptStatus === 'IMPROVABLE')
     template = buildTemplate(rawPrompt);
  console.log('template : ', template);
  console.log('-----------------------------------');
  const rawOutput = await runOllama({ model: 'llama3.2:1b', prompt: template });
  console.log('Raw output : ', rawOutput);
  return parseOutput(rawOutput);
}

// Example usage: outputs only the improved prompt text
(async () => {
  const raw = 'What is pointers in  C++';
  const improved = await improvePrompt(raw);
  console.log(improved);
})();
