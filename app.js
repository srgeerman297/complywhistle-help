let qnaData = [];

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(userQuestion, entry) {
  const normalizedQuestion = normalize(userQuestion);
  let score = 0;

  for (const question of entry.questions) {
    const normalizedStoredQuestion = normalize(question);

    if (normalizedQuestion === normalizedStoredQuestion) {
      score += 100;
    }

    if (normalizedQuestion.includes(normalizedStoredQuestion)) {
      score += 40;
    }

    if (normalizedStoredQuestion.includes(normalizedQuestion)) {
      score += 25;
    }

    const userWords = normalizedQuestion.split(" ");
    const storedWords = normalizedStoredQuestion.split(" ");
    const matchingWords = userWords.filter((word) => storedWords.includes(word));
    score += matchingWords.length * 4;
  }

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedQuestion.includes(normalizedKeyword)) {
      score += 10;
    }
  }

  return score;
}

function findBestAnswer(userQuestion) {
  let bestEntry = null;
  let bestScore = 0;

  for (const entry of qnaData) {
    const score = scoreMatch(userQuestion, entry);

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (!bestEntry || bestScore < 20) {
    return "I could not find a clear answer in the current ComplyWhistle help content yet. Please contact your administrator or AXIOMA for assistance.";
  }

  return bestEntry.answer;
}

function addMessage(text, sender) {
  const chatBox = document.getElementById("chat-box");
  const message = document.createElement("div");
  message.className = `message ${sender}`;
  message.textContent = text;
  chatBox.appendChild(message);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function loadQnA() {
  try {
    const response = await fetch("data/qna.json");

    if (!response.ok) {
      throw new Error("Could not load Q&A data.");
    }

    qnaData = await response.json();
  } catch (error) {
    addMessage(
      "The help content could not be loaded right now. Please check that data/qna.json exists and try again.",
      "bot"
    );
    console.error(error);
  }
}

function askQuestion(question) {
  const cleanedQuestion = question.trim();
  if (!cleanedQuestion) {
    return;
  }

  addMessage(cleanedQuestion, "user");
  const answer = findBestAnswer(cleanedQuestion);
  addMessage(answer, "bot");
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadQnA();

  const chatForm = document.getElementById("chat-form");
  const userInput = document.getElementById("user-input");
  const suggestionButtons = document.querySelectorAll(".suggestion-chip");

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    askQuestion(userInput.value);
    userInput.value = "";
    userInput.focus();
  });

  suggestionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.getAttribute("data-question") || "";
      askQuestion(question);
      userInput.focus();
    });
  });
});
