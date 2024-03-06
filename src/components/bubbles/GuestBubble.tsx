import { Show, onMount } from 'solid-js'
import { Avatar } from '../avatars/Avatar'
import { Marked } from '@ts-stack/markdown'

type Props = {
  message: string
  showAvatar?: boolean
  avatarSrc?: string
  backgroundColor?: string
  textColor?: string
}

const defaultBackgroundColor = '#3B81F6'
const defaultTextColor = '#ffffff'

Marked.setOptions({ isNoP: true })

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
  let userMessageEl: HTMLDivElement | undefined

  onMount(() => {
    if (userMessageEl) {
      let message = processMessage(props.message).replaceAll("\n", "<br>")
      userMessageEl.innerHTML = /*props.message;*/Marked.parse(message)
    }
  })

  return (
    <div
      class="flex justify-end mb-2 items-end guest-container"
      style={{ 'margin-left': '50px' }}
    >
      <span
        ref={userMessageEl}
        class="px-4 py-2 mr-2 whitespace-pre-wrap max-w-full chatbot-guest-bubble"
        data-testid="guest-bubble"
        style={{ "background-color": props.backgroundColor ?? defaultBackgroundColor, color: props.textColor ?? defaultTextColor, 'border-radius': '6px' }}
      />
      <Show when={props.showAvatar}>
        <Avatar initialAvatarSrc={props.avatarSrc} />
      </Show>
    </div>
  )
}
