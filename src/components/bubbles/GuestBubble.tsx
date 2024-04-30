import { For, Show, onMount } from 'solid-js';
import { Avatar } from '../avatars/Avatar';
import { Marked } from '@ts-stack/markdown';
import { MessageType } from '../Bot';

type Props = {
  message: MessageType;
  apiHost?: string;
  chatflowid: string;
  chatId: string;
  showAvatar?: boolean;
  avatarSrc?: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
};

const defaultBackgroundColor = '#3B81F6';
const defaultTextColor = '#ffffff';
const defaultFontSize = 16;

Marked.setOptions({ isNoP: true });

function processMessage(originalMessage) {
    //NOTE: same in BotBubble
    const lines = originalMessage.split("\n");
    let processedLines = [];
    let previousLineWasListItem = false;

    lines.forEach((line, index) => {
        // Check if the line is likely part of a numbered list
        if (/^\d+\.\s+/.test(line)) {
            let currentNumber = parseInt(line.match(/^\d+/)[0], 10);
            let expectedNextNumber = currentNumber + 1;

            let nextLine = lines[index + 1];
            let nextLineStartsWithExpectedNumber = nextLine && nextLine.startsWith(`${expectedNextNumber}.`);

            // Check if the current line continues a list or starts a new one expectedly
            if (previousLineWasListItem || nextLineStartsWithExpectedNumber) {
                previousLineWasListItem = true; // It's part of a list
            } else {
                // It's not part of a list, prevent Markdown interpretation
                line = line.replace(/^(\d+)\./, '$1.​');
                previousLineWasListItem = false;
            }
        } else {
            previousLineWasListItem = false; // Reset for lines that are clearly not list items
        }

        processedLines.push(line);
    });

    return processedLines.join("\n");
}

export const GuestBubble = (props: Props) => {
  let userMessageEl: HTMLDivElement | undefined;

  onMount(() => {
    if (userMessageEl) {
      let message = processMessage(props.message.message).replaceAll("\n", "<br>")
      userMessageEl.innerHTML = /*props.message;*/Marked.parse(message)
    }
  });

  return (
    <div class="flex justify-end mb-2 items-end guest-container" style={{ 'margin-left': '50px' }}>
      <div
        class="max-w-full flex flex-col justify-center items-start chatbot-guest-bubble px-4 py-2 gap-2"
        data-testid="guest-bubble"
        style={{
          'background-color': props.backgroundColor ?? defaultBackgroundColor,
          color: props.textColor ?? defaultTextColor,
          'border-radius': '6px',
        }}
      >
        {props.message.fileUploads && props.message.fileUploads.length > 0 && (
          <div class="flex flex-col items-start flex-wrap w-full gap-2">
            <For each={props.message.fileUploads}>
              {(item) => {
                const fileData = `${props.apiHost}/api/v1/get-upload-file?chatflowId=${props.chatflowid}&chatId=${props.chatId}&fileName=${item.name}`;
                const src = (item.data as string) ?? fileData;
                return (
                  <>
                    {item.mime && item.mime.startsWith('image/') ? (
                      <div class="flex items-center justify-center max-w-[128px] mr-[10px] p-0 m-0">
                        <img class="w-full h-full bg-cover" src={src} />
                      </div>
                    ) : (
                      <audio class="w-[200px] h-10 block bg-cover bg-center rounded-none text-transparent" controls>
                        Your browser does not support the &lt;audio&gt; tag.
                        <source src={src} type={item.mime} />
                      </audio>
                    )}
                  </>
                );
              }}
            </For>
          </div>
        )}
        {props.message.message && (
          <span
            ref={userMessageEl}
            class="mr-2 whitespace-pre-wrap"
            style={{ 'font-size': props.fontSize ? `${props.fontSize}px` : `${defaultFontSize}` }}
          />
        )}
      </div>
      <Show when={props.showAvatar}>
        <Avatar initialAvatarSrc={props.avatarSrc} />
      </Show>
    </div>
  );
};
