const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { writeFileSync } = require('fs');

// Add delay function at the top level
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Add debug mode flag at the top level
const debugMode = process.argv.includes('--debug');

async function processPrompts() {
  let browser;

  try {
    if (!fs.existsSync('prompts.txt')) {
      throw new Error('prompts.txt file not found');
    }

    const fileContent = fs.readFileSync('prompts.txt', 'utf-8');
    const prompts = fileContent.split('\n').filter(line => line.trim());

    // Ensure outputs directory exists
    const outputsDir = path.join(__dirname, 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir);
    }

    // Create timestamp for the output file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFileName = path.join(outputsDir, `output-${timestamp}.txt`);
    let outputContent = '';

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
    const page = await browser.newPage();

    await page.goto('https://grok.com');

    for (const [index, prompt] of prompts.entries()) {
      if (!prompt.trim()) continue;
      console.log(`Processing prompt: ${prompt}`);

      try {
        const containerSelector = 'div[class*="ring-input-border"]';
        await page.waitForSelector(containerSelector, { timeout: 10000 });

        const textareaSelector = 'textarea.w-full';
        await page.waitForSelector(textareaSelector, { timeout: 10000 });
        await page.focus(textareaSelector);
        await delay(1000);
        await page.keyboard.type(prompt);
        await page.keyboard.press('Enter');

        let previousResponseText = '';
        let responseStableCount = 0;
        const maxWaitTime = 20000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
       
          const currentResponseText = await page.evaluate(() => {
            const elements = document.querySelectorAll('div.relative.group.flex.flex-col.justify-center.w-full.max-w-3xl.md\\:px-4.pb-2.message-row.items-start');
            if (elements.length === 0) return '';
            const lastElement = elements[elements.length - 1];
            const proseElements = lastElement.querySelectorAll('.prose p, .prose li');
            return Array.from(proseElements)
              .map(el => el.textContent.trim())
              .filter(text => text)
              .join('\n');
          });

          if (currentResponseText === previousResponseText && currentResponseText !== '') {
            responseStableCount++;
            if (responseStableCount >= 3) {
              break;
            }
          } else {
            responseStableCount = 0;
            previousResponseText = currentResponseText;
          }

          await delay(1000);
        }

        const responseText = await page.evaluate(() => {
          const elements = document.querySelectorAll('div.relative.group.flex.flex-col.justify-center.w-full.max-w-3xl.md\\:px-4.pb-2.message-row.items-start');
          const lastElement = elements[elements.length - 1];
          if (lastElement) {
            const proseElements = lastElement.querySelectorAll('.prose p, .prose li');
            return Array.from(proseElements)
              .map(el => el.textContent.trim())
              .filter(text => text)
              .join('\n');
          }
          return '';
        });
        
        const promptTimestamp = new Date().toISOString();
        const processingTime = Date.now() - startTime;

        if (debugMode) {
          outputContent += `\n--- Prompt #${index + 1} (${promptTimestamp}) ---\n${prompt}\n--- Response (Processing time: ${processingTime}ms) ---\n${responseText}\n\n`;
        } else {
          outputContent += `${responseText}\n\n`;
        }

        console.log(`Response for prompt "${prompt}" will be saved to ${outputFileName}`);
      } catch (promptError) {
        console.error(`Error processing prompt: ${prompt}`, promptError);
        continue;
      }
    }

    writeFileSync(outputFileName, outputContent);
    console.log(`All responses have been saved to ${outputFileName}`);

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

processPrompts().catch(console.error);