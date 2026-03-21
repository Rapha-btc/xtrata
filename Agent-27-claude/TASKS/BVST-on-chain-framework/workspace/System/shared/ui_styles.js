// System/shared/ui_styles.js
// Lean style loader: inject a single shared CSS file once.

function ensureBVSTCssLoaded() {
    if (document.querySelector('link[data-bvst-css="1"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./bvst.css', import.meta.url).toString();
    link.dataset.bvstCss = '1';
    document.head.appendChild(link);
}

// Backwards-compatible API used by Controls/Sequencer modules.
export const injectControlsStyles = () => ensureBVSTCssLoaded();
export const injectSequencerStyles = () => ensureBVSTCssLoaded();
export const injectGridSequencerStyles = () => ensureBVSTCssLoaded();
export const injectMidiStyles = () => ensureBVSTCssLoaded();
export const injectKeyboardStyles = () => ensureBVSTCssLoaded();
export const injectVisualizerStyles = () => ensureBVSTCssLoaded();
export const injectSamplerStyles = () => ensureBVSTCssLoaded();
