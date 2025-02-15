const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { writeFileSync } = require('fs');

// Add delay function at the top level
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Add debug mode flag at the top level
const debugMode = process.argv.includes('--debug');

async function launchBrowser() {
  return puppeteer.launch({
    headless: "new",
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: path.join(process.cwd(), 'chrome-profile')
  });
}

function ensureOutputsDirectory() {
  const outputsDir = path.join(__dirname, 'outputs');
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir);
  }
  return outputsDir;
}

function readPrompts() {
  if (!fs.existsSync('prompts.txt')) {
    throw new Error('prompts.txt file not found');
  }
  const fileContent = fs.readFileSync('prompts.txt', 'utf-8');
  return fileContent.split('\n').filter(line => line.trim());
}

async function selectExperimentalMode(page) {
  await page.goto('https://gemini.google.com/app');
  await page.waitForSelector('button.bard-mode-menu-button');
  await page.click('button.bard-mode-menu-button');
  await delay(1000);

  await page.waitForSelector('.mat-bottom-sheet-container button.mat-mdc-menu-item');
  const buttons = await page.$$('.mat-bottom-sheet-container button.mat-mdc-menu-item');
  for (const button of buttons) {
    const text = await button.evaluate(el => el.textContent);
    if (text.includes('2.0 Flash Thinking Experimental with apps')) {
      await button.click();
      break;
    }
  }
  await delay(2000);

  await page.waitForFunction(() => {
    const modeText = document.querySelector('.current-mode-title span')?.textContent;
    return modeText?.includes('2.0 Flash Thinking Experimental with apps');
  });
}

async function processPrompt(page, prompt, expectedCompletedDivs) {
  console.log(`Processing prompt: ${prompt}`);

  try {
    await page.waitForSelector('.ql-editor');
    await page.evaluate((promptText) => {
      const editor = document.querySelector('.ql-editor');
      editor.textContent = promptText;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, prompt);

    await delay(1000);
    await page.keyboard.press('Enter');

    // Increase timeout to 60 seconds
    await page.waitForFunction((expectedCount) => {
      const completedDivs = document.querySelectorAll('div.avatar_primary_animation.is-gpi-avatar[data-test-lottie-animation-status="completed"]');
      return completedDivs.length === expectedCount;
    }, { timeout: 120000 }, expectedCompletedDivs);

  } catch (promptError) {
    console.error(`Error processing prompt: ${prompt}`, promptError);
  }
}

function readPromptsFromDirectory() {
  const promptsDir = path.join(__dirname, 'prompts');
  if (!fs.existsSync(promptsDir)) {
    throw new Error('prompts directory not found');
  }

  const files = fs.readdirSync(promptsDir)
    .filter(file => file !== '.DS_Store');
  
  const allPrompts = files.map(file => {
    const content = fs.readFileSync(path.join(promptsDir, file), 'utf-8');
    const lines = content.split('\n');
    let extraPrefix = '';
    let prompts = lines;

    // Check if first line starts with EXTRA:
    if (lines[0]?.trim().startsWith('EXTRA:')) {
      extraPrefix = lines[0].substring('EXTRA:'.length).trim();
      prompts = lines.slice(1); // Remove the EXTRA line
    }

    return {
      filename: file,
      extraPrefix,
      prompts: prompts
        .filter(line => line.trim())
        .map(prompt => extraPrefix ? `${extraPrefix} ${prompt.trim()}` : prompt.trim())
    };
  });
  
  return allPrompts;
}

async function captureAllResponses(page) {
  try {
    // Wait for all response elements to be present
    await page.waitForSelector('.model-response-text', { timeout: 30000 });
    
    // Capture all responses with proper paragraph formatting
    const responses = await page.evaluate(() => {
      const responseElements = document.querySelectorAll('.model-response-text');
      return Array.from(responseElements).map(el => {
        // Get all paragraphs from the response
        const paragraphs = Array.from(el.querySelectorAll('p'))
          .map(p => p.textContent.trim())
          .filter(p => p.length > 0)
          .join('\n\n');
        return paragraphs || el.textContent; // Fallback to text content if no paragraphs found
      }).join('\n\n');
    });
    
    return responses;
  } catch (error) {
    console.error('Error capturing responses:', error);
    return 'Failed to capture responses';
  }
}

async function processPrompts() {
  let browser;

  try {
    const promptFiles = readPromptsFromDirectory();
    const outputsDir = ensureOutputsDirectory();

    browser = await launchBrowser();
    const page = await browser.newPage();
    await selectExperimentalMode(page);

    for (const { filename, prompts } of promptFiles) {
      console.log(`Processing file: ${filename}`);
      
      for (const [index, prompt] of prompts.entries()) {
        if (!prompt.trim()) continue;
        const expectedCompletedDivs = index + 1;
        await processPrompt(page, prompt, expectedCompletedDivs);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFileName = path.join(outputsDir, `output-${path.parse(filename).name}-${timestamp}.txt`);
      
      const outputContent = await captureAllResponses(page);
      writeFileSync(outputFileName, outputContent);
      console.log(`Responses from ${filename} have been saved to ${outputFileName}`);
    }

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

processPrompts().catch(console.error);