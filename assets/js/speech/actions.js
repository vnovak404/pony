export const dispatchSpeechCommand = (action) => {
  if (!action || !action.command) return;
  const event = new CustomEvent("pony-speech-command", { detail: action });
  document.dispatchEvent(event);
};
