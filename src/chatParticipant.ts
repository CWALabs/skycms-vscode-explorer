import * as vscode from 'vscode';
import { SkyCmsSiteProfile } from './siteManager';
import { findRelevantSkyCmsDocsWithLiveLookup, SkyCmsDocEntry } from './docsIndex';

const SKYCMS_CHAT_PARTICIPANT_ID = 'skycms-explorer.skycms';
const SKYCMS_DOCS_URL = 'https://docs.sky-cms.com/';
const SKYCMS_BASE_PROMPT = [
  'You are the SkyCMS assistant for Visual Studio Code.',
  'Help with SkyCMS concepts, editor workflows, extension usage, and documentation discovery.',
  'Prefer practical, concrete answers.',
  'If you are not sure about a product detail, say that explicitly and point the user to the official docs instead of guessing.',
  `The official documentation site is ${SKYCMS_DOCS_URL}.`,
  'Use SkyCMS terms consistently: site, editor URL, layout, template, article, blog post, field, banner image.',
  'If the request is about documentation, answer briefly and point to the most relevant docs area or the main docs site.',
].join(' ');

const COMMAND_TO_TOPIC: Record<string, string> = {
  docs: 'documentation',
  explain: 'SkyCMS concepts',
  layouts: 'layouts',
  templates: 'templates',
  articles: 'articles and content lifecycle',
};

interface SkyCmsChatResult extends vscode.ChatResult {
  metadata: {
    command: string;
  };
}

export function registerSkyCmsChatParticipant(
  context: vscode.ExtensionContext,
  getActiveSite: () => SkyCmsSiteProfile | undefined,
): void {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<SkyCmsChatResult> => {
    const activeSite = getActiveSite();
    const command = request.command ?? 'ask';
    const docsQuery = buildDocsQuery(command, request.prompt);

    stream.progress('Searching SkyCMS docs...');
    const matchedDocs = await findRelevantSkyCmsDocsWithLiveLookup(docsQuery);

    stream.progress('Gathering SkyCMS context...');
    stream.reference(vscode.Uri.parse(SKYCMS_DOCS_URL));
    for (const doc of matchedDocs) {
      stream.reference(vscode.Uri.parse(doc.url));
    }

    if (shouldReturnCuratedDocs(command, request.prompt)) {
      stream.markdown(renderCuratedDocsResponse(command, matchedDocs));
      addCommonButtons(stream, activeSite);
      return { metadata: { command } };
    }

    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(SKYCMS_BASE_PROMPT),
      vscode.LanguageModelChatMessage.User(buildSiteContext(activeSite)),
      vscode.LanguageModelChatMessage.User(buildDocsContext(matchedDocs)),
    ];

    appendHistory(messages, chatContext.history);

    const userPrompt = buildUserPrompt(command, request.prompt, matchedDocs);

    messages.push(vscode.LanguageModelChatMessage.User(userPrompt));

    try {
      const response = await request.model.sendRequest(messages, {}, token);
      for await (const fragment of response.text) {
        stream.markdown(fragment);
      }

      addCommonButtons(stream, activeSite);
    } catch (error) {
      handleChatError(error, stream);
    }

    return { metadata: { command } };
  };

  const participant = vscode.chat.createChatParticipant(SKYCMS_CHAT_PARTICIPANT_ID, handler);
  participant.followupProvider = {
    provideFollowups(_result, _chatContext, _token) {
      return [
        { prompt: 'Where should I start in the SkyCMS docs?', command: 'docs' },
        { prompt: 'Explain layouts, templates, and articles in SkyCMS', command: 'explain' },
        { prompt: 'Show me the best layout docs', command: 'layouts' },
        { prompt: 'Show me the best template docs', command: 'templates' },
      ];
    },
  };

  context.subscriptions.push(participant);
}

function appendHistory(
  messages: vscode.LanguageModelChatMessage[],
  history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>,
): void {
  for (const item of history) {
    if (item instanceof vscode.ChatRequestTurn && item.prompt.trim()) {
      messages.push(vscode.LanguageModelChatMessage.User(item.prompt));
      continue;
    }

    if (item instanceof vscode.ChatResponseTurn) {
      const content = item.response
        .map((part) => {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            return part.value.value;
          }

          return '';
        })
        .join('')
        .trim();

      if (content) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(content));
      }
    }
  }
}

function buildSiteContext(activeSite: SkyCmsSiteProfile | undefined): string {
  if (!activeSite) {
    return 'No active SkyCMS site is configured in the extension right now.';
  }

  return `The active SkyCMS site in VS Code is named "${activeSite.name}" and uses editor URL ${activeSite.editorUrl}.`;
}

function handleChatError(error: unknown, stream: vscode.ChatResponseStream): void {
  if (error instanceof vscode.LanguageModelError) {
    stream.markdown(`SkyCMS chat could not reach the selected model: ${error.message}`);
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  stream.markdown(`SkyCMS chat failed: ${message}`);
}

function buildDocsQuery(command: string, prompt: string): string {
  const topic = COMMAND_TO_TOPIC[command] ?? '';
  return `${topic} ${prompt}`.trim();
}

function shouldReturnCuratedDocs(command: string, prompt: string): boolean {
  if (command === 'docs') {
    return !prompt.trim();
  }

  return command === 'layouts' || command === 'templates' || command === 'articles';
}

function renderCuratedDocsResponse(command: string, docs: SkyCmsDocEntry[]): string {
  const heading = command === 'layouts'
    ? 'Best SkyCMS docs for layouts:'
    : command === 'templates'
      ? 'Best SkyCMS docs for templates:'
      : command === 'articles'
        ? 'Best SkyCMS docs for articles and content flow:'
        : `The official SkyCMS documentation is available at ${SKYCMS_DOCS_URL}. Start with these pages:`;

  const lines = docs.map((doc) => `- [${doc.title}](${doc.url}) - ${doc.summary}`);
  return `${heading}\n\n${lines.join('\n')}`;
}

function buildDocsContext(docs: SkyCmsDocEntry[]): string {
  if (docs.length === 0) {
    return `Official docs site: ${SKYCMS_DOCS_URL}.`;
  }

  const renderedDocs = docs
    .map((doc) => `${doc.title}: ${doc.summary} (${doc.url})`)
    .join('\n');

  return `Relevant SkyCMS documentation pages:\n${renderedDocs}`;
}

function buildUserPrompt(command: string, prompt: string, docs: SkyCmsDocEntry[]): string {
  if (command === 'docs') {
    return `The user wants documentation help for this SkyCMS topic: ${prompt}. Prefer the matched docs pages and mention the most relevant ones first.`;
  }

  if (command === 'explain') {
    return `Explain this SkyCMS topic clearly and practically: ${prompt}. Use the matched docs pages as supporting context.`;
  }

  if (command === 'layouts' || command === 'templates' || command === 'articles') {
    const topic = COMMAND_TO_TOPIC[command] ?? command;
    return `Summarize the key SkyCMS guidance for ${topic}. Prioritize these docs: ${docs.map((doc) => doc.title).join(', ')}.`;
  }

  return prompt;
}

function addCommonButtons(
  stream: vscode.ChatResponseStream,
  activeSite: SkyCmsSiteProfile | undefined,
): void {
  stream.button({
    command: 'skycms.openDocs',
    title: 'Open SkyCMS Docs',
  });

  stream.button({
    command: 'skycms.askSkyCms',
    title: 'Open SkyCMS Chat',
  });

  if (activeSite?.editorUrl) {
    stream.button({
      command: 'skycms.openEditorSite',
      title: 'Open Current Editor Site',
    });
  }
}
