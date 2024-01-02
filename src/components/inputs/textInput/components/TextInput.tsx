import { ShortTextInput } from './ShortTextInput'
import { MultiLineTextInput } from './MultiLineTextInput'
import { SendButton } from '@/components/SendButton'
import { isMobile } from '@/utils/isMobileSignal'
import { createSignal, onMount, onCleanup, createEffect } from 'solid-js'
import { getIsTyping, addIsTypingListener, removeIsTypingListener } from '@/components/Bot';


type Props = {
    placeholder?: string
    backgroundColor?: string
    textColor?: string
    sendButtonColor?: string
    defaultValue?: string
    fontSize?: number
    onSubmit: (value: string) => void
}

const defaultBackgroundColor = '#ffffff'
const defaultTextColor = '#303235'

export const TextInput = (props: Props) => {
    const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '')
    let inputRef: HTMLInputElement | HTMLTextAreaElement | undefined

    const [isTyping, setIsTyping] = createSignal(getIsTyping());
    const handleTypingChange = (newIsTyping) => {
        console.log('handleTypingChange: ' + newIsTyping);
        setIsTyping(newIsTyping);
    };

    createEffect(() => {
        // This function should run when the component mounts
        const handleTypingChange = (newIsTyping) => {
            setIsTyping(newIsTyping);
        };

        // Register the listener
        addIsTypingListener(handleTypingChange);

        // Cleanup: Unregister the listener when the component unmounts
        onCleanup(() => {
            removeIsTypingListener(handleTypingChange);
        });
    });

    const handleInput = (inputValue: string) => setInputValue(inputValue)

    const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity()

    const submit = () => {

        if (getIsTyping())
            return;

        if (checkIfInputIsValid()) props.onSubmit(inputValue())
        setInputValue('')
    }

    const submitWhenEnter = (e: KeyboardEvent) => {
        if (getIsTyping())
            return;

        // Check if IME composition is in progress
        const isIMEComposition = e.isComposing || e.keyCode === 229
        if (e.key === 'Enter' && !isIMEComposition) {
            if (e.shiftKey) {
                
            } else {
                // Submit on Enter (without Shift)
                e.preventDefault();
                submit();
            }
        }
    }

    onMount(() => {
        if (!isMobile() && inputRef) inputRef.focus()
    })

    return (
        <div
            class={'flex items-center justify-between chatbot-input'}
            data-testid='input'
            style={{
                'border-top': '1px solid #eeeeee',
                position: 'absolute',
                left: '20px',
                right: '20px',
                bottom: '40px',
                margin: 'auto',
                "z-index": 1000,
                "background-color": props.backgroundColor ?? defaultBackgroundColor,
                color: props.textColor ?? defaultTextColor
            }}
            onKeyDown={submitWhenEnter}
        >
            <MultiLineTextInput
                ref={inputRef as HTMLTextAreaElement}
                onInput={handleInput}
                value={inputValue()}
                fontSize={props.fontSize}
                placeholder={props.placeholder ?? 'Type your question'}
            />
            <SendButton sendButtonColor={props.sendButtonColor} type='button' isDisabled={inputValue() === '' || isTyping()} class='my-2 ml-2' on:click={submit}>
                <span style={{ 'font-family': 'Poppins, sans-serif' }}>Send</span>
            </SendButton>
        </div>
    )
}
