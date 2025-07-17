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
- “NON_IMPROVABLE” (requests like code review, refactoring, or bug-fixing where prompt-improvement logic doesn’t apply).

Examples:

Q: “How can I improve this function?”  
A: NON_IMPROVABLE

Q: “Please refactor this code sample.”  
A: NON_IMPROVABLE

Q: “Can you review this code snippet?”  
A: NON_IMPROVABLE

Q: “Optimize this SQL query: SELECT * FROM users WHERE …”  
A: NON_IMPROVABLE

Q: “What is C++?”  
A: IMPROVABLE

Q: “Explain promises in JavaScript.”  
A: IMPROVABLE

Q: “List best practices for React state management.”  
A: IMPROVABLE

Q: “Describe the Observer pattern.”  
A: IMPROVABLE

Now classify this prompt (respond with exactly one label):  
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
----------------------------------------------------------

Always fill **all** slots. Infer sensible defaults when unspecified.  
Try to provide code examples wherever applicable.
Add more requirements and steps as you like and don't be lazy in response. 
Don't add irrelevant points but don't hold back on adding any important information to be required in the context that can improve the prompt.
Don't include images and illustrative examples in the prompt.
I am gonna give you a few examples to get familiar
The audience are exceptional Software engineers so adjust and information keeping that in mind
Make sure to include all the requirements to clearly explain the concept asked in the prompt. Don't miss anything.
Don't include non-technical information in the prompt, only use technically useful information.

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
* Audience: Experienced software engineers with proficiency in general programming concepts

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
  let promptStatus = await runOllama({ model: 'llama3.1:8b', prompt: classifyPrompt(rawPrompt)});
    promptStatus = parseOutput(promptStatus);
  let template;
  console.log('Status : ', promptStatus);
  if(promptStatus === 'IMPROVABLE')
     template = buildTemplate(rawPrompt);
  console.log('template : ', template);
  console.log('-----------------------------------');
  const rawOutput = await runOllama({ model: 'llama3.1:8b', prompt: template });
  console.log('Raw output : ', rawOutput);
  return parseOutput(rawOutput);
}

// Example usage: outputs only the improved prompt text
(async () => {
  const raw = 'What is Application layer in TCP/IP Model';
  const improved = await improvePrompt(raw);
  console.log(improved);
})();
