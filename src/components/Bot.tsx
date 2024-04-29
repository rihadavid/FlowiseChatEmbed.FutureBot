import {createSignal, createEffect, For, onMount, Show, onCleanup} from 'solid-js'
import { sendMessageQuery, isStreamAvailableQuery, IncomingInput } from '@/queries/sendMessageQuery'
import { TextInput } from './inputs/textInput'
import { GuestBubble } from './bubbles/GuestBubble'
import { BotBubble } from './bubbles/BotBubble'
import { LoadingBubble } from './bubbles/LoadingBubble'
import { SourceBubble } from './bubbles/SourceBubble'
import { BotMessageTheme, TextInputTheme, UserMessageTheme } from '@/features/bubble/types'
import { Badge } from './Badge'
import socketIOClient from 'socket.io-client'
import { Popup } from '@/features/popup'

type messageType = 'apiMessage' | 'userMessage' | 'usermessagewaiting'

export type MessageType = {
    message: string
    type: messageType,
    sourceDocuments?: any
}

export type BotProps = {
    chatflowid: string
    apiHost?: string
    chatflowConfig?: Record<string, unknown>
    welcomeMessage?: string
    botMessage?: BotMessageTheme
    userMessage?: UserMessageTheme
    textInput?: TextInputTheme
    poweredByTextColor?: string
    badgeBackgroundColor?: string
    fontSize?: number
    placement?: 'inline' | 'bubble';
}

const defaultWelcomeMessage = 'Hi there! How can I help?'

let isTyping = false;
const eventListeners = [];

export const setIsTyping = (value) => {
    if (isTyping !== value) {
        isTyping = value;
        eventListeners.forEach((fn) => fn(value));
    }
};

export const getIsTyping = () => {
    return isTyping;
};

export const addIsTypingListener = (fn) => {
    eventListeners.push(fn);
};

export const removeIsTypingListener = (fn) => {
    const index = eventListeners.indexOf(fn);
    if (index > -1) {
        eventListeners.splice(index, 1);
    }
};

export const Bot = (props: BotProps & { class?: string }) => {
    let chatContainer: HTMLDivElement | undefined
    let bottomSpacer: HTMLDivElement | undefined
    let botContainer: HTMLDivElement | undefined

    const [isTypingSignal, setIsTypingSignal] = createSignal(getIsTyping());


    const handleTypingChange = (newIsTyping) => {
        console.log('handleTypingChange: ' + newIsTyping);
        setIsTypingSignal(newIsTyping);
    };

    createEffect(() => {
        // This function should run when the component mounts
        const handleTypingChange = (newIsTyping) => {
            setIsTypingSignal(newIsTyping);
        };

        // Register the listener
        addIsTypingListener(handleTypingChange);

        // Cleanup: Unregister the listener when the component unmounts
        onCleanup(() => {
            removeIsTypingListener(handleTypingChange);
        });
    });

    const [savedChatId, setSavedChatId] = createSignal('')
    const [webRequestChatId, setWebRequestChatId] = createSignal('')
    const [socketIOClientId, setSocketIOClientId] = createSignal('')
    const [userInput, setUserInput] = createSignal('')
    const [loading, setLoading] = createSignal(false)
    const [sourcePopupOpen, setSourcePopupOpen] = createSignal(false)
    const [sourcePopupSrc, setSourcePopupSrc] = createSignal({})
    const [messages, setMessages] = createSignal<MessageType[]>([
        {
            message: props.welcomeMessage ?? defaultWelcomeMessage,
            type: 'apiMessage'
        },
    ], { equals: false })
    const [timezone, setTimezone] = createSignal('')
    const [isChatFlowAvailableToStream, setIsChatFlowAvailableToStream] = createSignal(false)

    const chatHistoryIdentifier = 'chatHistory' + (props.placement === 'inline' ? 'Inline' : '') + (props.chatflowConfig ? (props.chatflowConfig.botId ?? props.chatflowConfig.pineconeNamespace) : '');

    const clearChat = () => {
        if(isTypingSignal())
            return;
        localStorage.removeItem(chatHistoryIdentifier); // Use the existing chatHistoryIdentifier variable
        setMessages([
            {
                message: props.welcomeMessage ?? defaultWelcomeMessage, // Use the existing defaultWelcomeMessage variable or props
                type: 'apiMessage'
            }
        ]);
        if (useWebRequest())
            setWebRequestChatId(savedChatId() || generateRandomString(10))
    };

    const setMessagesWithStorage = (updateFunction) => {
        setMessages((prevMessages) => {
            const updatedMessages = updateFunction(prevMessages);
            if(!props.chatflowConfig.clearOnRefresh)
            {
                const dataToSave = {
                    chatId: savedChatId() || socketIOClientId() || webRequestChatId(),
                    timestamp: Date.now(),
                    messages: updatedMessages,
                };
                localStorage.setItem(chatHistoryIdentifier, JSON.stringify(dataToSave));
            }
            return updatedMessages;
        });
    };

    onMount(() => {
        if(!props.chatflowConfig.clearOnRefresh)
        {
            const savedData = JSON.parse(localStorage.getItem(chatHistoryIdentifier));
            if (savedData) {
                const currentTime = Date.now();
                const timeElapsed = currentTime - savedData.timestamp;

                if (timeElapsed <= 43200000) { // 12 hours
                    setMessages(savedData.messages)
                    if(savedData.chatId)
                    {
                        setSavedChatId(savedData.chatId);
                        setWebRequestChatId(savedData.chatId);
                    }
                } else {
                    localStorage.removeItem(chatHistoryIdentifier); // Clear outdated history
                }
            }
        }

        if (!bottomSpacer) return
        setTimeout(() => {
            chatContainer?.scrollTo(0, chatContainer.scrollHeight)
        }, 50)
    })

    const scrollToBottom = () => {
        setTimeout(() => {
            chatContainer?.scrollTo(0, chatContainer.scrollHeight)
        }, 50)
    }

    const updateLastMessage = (text: string) => {
        setMessagesWithStorage(data => {
            const updated = data.map((item, i) => {
                if (i === data.length - 1) {
                    return { ...item, message: item.message + text };
                }
                return item;
            });
            return [...updated];
        });
    }

    const updateLastMessageSourceDocuments = (sourceDocuments: any) => {
        setMessagesWithStorage(data => {
            const updated = data.map((item, i) => {
                if (i === data.length - 1) {
                    return { ...item, sourceDocuments: sourceDocuments };
                }
                return item;
            });
            return [...updated];
        });
    }

    // Handle errors
    const handleError = (message = 'Oops! There seems to be an error. Please try again.') => {
        setMessagesWithStorage((prevMessages) => [...prevMessages, { message, type: 'apiMessage' }])
        setLoading(false)
        setUserInput('')
        scrollToBottom()
    }

    function useWebRequest() {
        return (props.apiHost as string).endsWith('lambda-url.eu-central-1.on.aws')
    }

    // Handle form submission
    const handleSubmit = async (value: string) => {
        setUserInput(value)

        if (value.trim() === '') {
            return
        }

        setIsTyping(true);
        setLoading(true)
        scrollToBottom()

        // Send user question and history to API
        const welcomeMessage = props.welcomeMessage ?? defaultWelcomeMessage
        const messageList = messages().filter((msg) => msg.message !== welcomeMessage).map(m => { return { 'message': m.message, 'type': m.type } })

        setMessagesWithStorage((prevMessages) => [...prevMessages, { message: value, type: 'userMessage' }])

        const body: IncomingInput = {
            question: value,
            history: messageList
        }

        if (props.chatflowConfig) body.overrideConfig = props.chatflowConfig

        if (isChatFlowAvailableToStream() && !useWebRequest()){
            body.socketIOClientId = socketIOClientId()

            if(savedChatId())
                body.chatId = savedChatId();
        }
        else{
            body.webRequestChatId = savedChatId() || webRequestChatId()
            body.timezone = timezone()
        }

        const result = await sendMessageQuery({
            chatflowid: props.chatflowid,
            apiHost: props.apiHost,
            body
        })

        if (result.data) {

            //console.log('result data: ' + JSON.stringify(result.data))

            if(useWebRequest())
                setIsTyping(false);

            const data = handleVectaraMetadata(result.data)

            if (typeof data === 'object' && data.text && data.sourceDocuments) {
                if (!isChatFlowAvailableToStream()) {
                    setMessagesWithStorage((prevMessages) => [
                        ...prevMessages,
                        { message: data.text, sourceDocuments: data.sourceDocuments, type: 'apiMessage' }
                    ])
                }
            } else {
                if (!isChatFlowAvailableToStream()) setMessagesWithStorage((prevMessages) => [...prevMessages, { message: data, type: 'apiMessage' }])
            }
            setLoading(false)
            setUserInput('')
            scrollToBottom()
        }
        if (result.error) {
            setIsTyping(false);
            const error = result.error
            console.error(error)
            const err: any = error
            const errorData = typeof err === 'string' ? err : err.response.data || `${err.response.status}: ${err.response.statusText}`
            handleError(errorData)
            return
        }
    }

    function generateRandomString(length) {
        var result           = '';
        var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for ( var i = 0; i < length; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }

    function getBrowserTimezone() {
        // Get the current timezone offset in minutes and invert the sign
        const offset = -new Date().getTimezoneOffset();

        // Convert the offset to hours and minutes
        const absOffset = Math.abs(offset);
        const hours = Math.floor(absOffset / 60);
        const minutes = absOffset % 60;

        // Format the timezone in the GMT±H or GMT±H:MM format
        const sign = offset >= 0 ? "+" : "-";
        const formattedHours = hours.toString().padStart(2, '0');
        const formattedMinutes = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';

        return `GMT${sign}${formattedHours}${formattedMinutes}`;
    }

    // Auto scroll chat to bottom
    createEffect(() => {
        if (messages()) scrollToBottom()
    })

    createEffect(() => {
        if (props.fontSize && botContainer) botContainer.style.fontSize = `${props.fontSize}px`
    })

    // eslint-disable-next-line solid/reactivity
    createEffect(async () => {


        if(props.chatflowConfig?.useCalendly){
            const cssLink = document.createElement('link');
            cssLink.href = 'https://assets.calendly.com/assets/external/widget.css';
            cssLink.rel = 'stylesheet';
            document.head.appendChild(cssLink);

            const script = document.createElement("script");
            script.src = "https://assets.calendly.com/assets/external/widget.js";
            script.async = true;
            document.head.appendChild(script);
        }

        if (useWebRequest()){

            if (props.chatflowConfig?.useTimezone)
                setTimezone(getBrowserTimezone());

            setWebRequestChatId(savedChatId() || generateRandomString(10))
            return;
        }




        const { data } = await isStreamAvailableQuery({
            chatflowid: props.chatflowid,
            apiHost: props.apiHost,
        })

        if (data) {
            setIsChatFlowAvailableToStream(data?.isStreaming ?? false)
        }

        const socket = socketIOClient(props.apiHost as string)

        socket.on('connect', () => {
            setSocketIOClientId(socket.id)
        })

        let started;

        socket.on('start', () => {
            started = true;
            setIsTyping(true);
            setMessagesWithStorage((prevMessages) => [...prevMessages, { message: '', type: 'apiMessage' }])
        })

        socket.on('end', () => {
            if (started) {
                started = false;
            setIsTyping(false);
            }
        })

        socket.on('sourceDocuments', updateLastMessageSourceDocuments)

        socket.on('token', updateLastMessage)

        // eslint-disable-next-line solid/reactivity
        return () => {
            setUserInput('')
            setMessagesWithStorage([
                {
                    message: props.welcomeMessage ?? defaultWelcomeMessage,
                    type: 'apiMessage'
                }
            ])
            if (socket) {
                socket.disconnect()
                setSocketIOClientId('')
            }
        }
    })

    const isValidURL = (url: string): URL | undefined => {
        try {
            return new URL(url)
        } catch (err) {
            return undefined
        }
    }

    const handleVectaraMetadata = (message: any): any => {
        if (message.sourceDocuments && message.sourceDocuments[0].metadata.length) {
            message.sourceDocuments = message.sourceDocuments.map((docs: any) => {
                const newMetadata: { [name: string]: any } = docs.metadata.reduce((newMetadata: any, metadata: any) => {
                    newMetadata[metadata.name] = metadata.value;
                    return newMetadata;
                }, {})
                return {
                    pageContent: docs.pageContent,
                    metadata: newMetadata,
                }
            })
        }
        return message
    };

    const removeDuplicateURL = (message: MessageType) => {
        const visitedURLs: string[] = []
        const newSourceDocuments: any = []

        message = handleVectaraMetadata(message)

        let sourceDocs = message.sourceDocuments;

        sourceDocs.sort((a, b) =>
        {
            // Check if the 'score' property exists in both objects
            if ('score' in a.metadata && 'score' in b.metadata) {
                // Sort by score in descending order
                return b.metadata.score - a.metadata.score;
            } else if ('score' in a.metadata) {
                // 'a' has a score, so it should come before 'b'
                return -1;
            } else if ('score' in b.metadata) {
                // 'b' has a score, so it should come after 'a'
                return 1;
            } else {
                // Neither 'a' nor 'b' has a score, maintain their original order
                return 0;
            }
        })

        sourceDocs.forEach((source: any) => {
            if (isValidURL(source.metadata['sourceUrl']) && !visitedURLs.includes(source.metadata['sourceUrl'])) {
                visitedURLs.push(source.metadata['sourceUrl'])
                newSourceDocuments.push(source)
            } else if (!isValidURL(source.metadata['sourceUrl'])) {
                newSourceDocuments.push(source)
            }
        })
        return newSourceDocuments
    }

    return (
        <>
            <div ref={botContainer} class={'relative flex w-full h-full text-base overflow-hidden bg-cover bg-center flex-col items-center chatbot-container ' + props.class}>
                <Show when={props.chatflowConfig.showClearButton && messages().length >= 3}>
                    <div className={`clearChatButton ${isTypingSignal() ? 'disabled' : ''}`} onClick={clearChat} style={{ pointerEvents: isTypingSignal() ? 'none' : 'auto' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor" viewBox="0 0 16 16" style={{ color: isTypingSignal() ? '#eaeaea' : 'white' }}>
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                        <span className="textAdjust">Vyčistit chat</span>
                    </div>
                </Show>
                <div class="flex w-full h-full justify-center">
                    <div style={{ "padding-bottom": '100px' }} ref={chatContainer} class="overflow-y-scroll min-w-full w-full min-h-full px-3 pt-10 relative scrollable-container chatbot-chat-view scroll-smooth">
                        <For each={[...messages()]}>
                            {(message, index) => (
                                <>
                                    {message.type === 'userMessage' && (
                                        <GuestBubble
                                            message={message.message}
                                            backgroundColor={props.userMessage?.backgroundColor}
                                            textColor={props.userMessage?.textColor}
                                            showAvatar={props.userMessage?.showAvatar}
                                            avatarSrc={props.userMessage?.avatarSrc}
                                        />
                                    )}
                                    {message.type === 'apiMessage' && (
                                        <BotBubble
                                            message={message.message}
                                            backgroundColor={props.botMessage?.backgroundColor}
                                            textColor={props.botMessage?.textColor}
                                            showAvatar={props.botMessage?.showAvatar}
                                            avatarSrc={props.botMessage?.avatarSrc}
                                        />
                                    )}
                                    {message.type === 'userMessage' && loading() && index() === messages().length - 1 && (
                                        <LoadingBubble />
                                    )}
                                    {message.sourceDocuments && message.sourceDocuments.length &&
                                        <div style={{ display: 'flex', "flex-direction": 'column', width: '100%' }}>
                                            <For each={[...removeDuplicateURL(message)]}>
                                                {(src) => {
                                                    const URL = isValidURL(src.metadata.source);
                                                    //console.log('src stringified: ' + JSON.stringify(src));
                                                    if (!src.metadata['sourceUrl'] || !src.metadata['score'] || src.metadata['score'] < 0.822)
                                                        return;
                                                    return (
                                                        <SourceBubble
                                                            pageContent={URL ? URL.pathname : src.pageContent}
                                                            metadata={src.metadata}
                                                            onSourceClick={() => {
                                                                if (URL) {
                                                                    window.open(src.metadata.source, '_blank')
                                                                }
                                                                else {
                                                                    setSourcePopupSrc(src);
                                                                    setSourcePopupOpen(true);
                                                                }
                                                            }}
                                                        />
                                                    )
                                                }}
                                            </For>
                                        </div>}
                                </>
                            )}
                        </For>
                    </div>
                    <TextInput
                        backgroundColor={props.textInput?.backgroundColor}
                        textColor={props.textInput?.textColor}
                        placeholder={props.textInput?.placeholder}
                        sendButtonColor={props.textInput?.sendButtonColor}
                        fontSize={props.fontSize}
                        defaultValue={userInput()}
                        onSubmit={handleSubmit}
                    />
                </div>
                <Badge badgeBackgroundColor={props.badgeBackgroundColor} poweredByTextColor={props.poweredByTextColor} policyUrl={props.chatflowConfig?.policyUrl} botContainer={botContainer} />
                <BottomSpacer ref={bottomSpacer} />
            </div>
            {sourcePopupOpen() && <Popup isOpen={sourcePopupOpen()} value={sourcePopupSrc()} onClose={() => setSourcePopupOpen(false)} />}
        </>
    )
}

type BottomSpacerProps = {
    ref: HTMLDivElement | undefined
}
const BottomSpacer = (props: BottomSpacerProps) => {
    return <div ref={props.ref} class="w-full h-32" />
}
