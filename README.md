Crete a prompts directory. Inside, each prompts file should be named differently and contain one prompt of the conversation you want to run in each line.

Add some things to it

You can in your file, if you add a file that start with EXTRA: , then everything subsequent to this that you write will include this detail.

For example,

```
EXTRA: Write everything like Neil Gaiman, 
Start a story about a man and his sad views on life, he is jaded and cynical
Continue the story, he meets a goat that gives him joy
```

This will run two commands to Gemini,  

Write everything like Neil Gaiman, Start a story about a man and his sad views on life, he is jaded and cynical

and


Write everything like Neil Gaiman, Continue the story, he meets a goat that gives him joy

Run this via `node index.js`

On the first run of this, it won't work because you're not logged in. Change the headless line to     `headless: "new"` to `headless: false`, and  login to the google account. Remember to change it back.

Output will be in outputs