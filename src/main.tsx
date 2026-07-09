import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { t } from './ui/theme';

// Global resets (the only non-inline CSS we need).
const css = `
  *{box-sizing:border-box;}
  html{margin:0;padding:0;background:${t.bg};overflow-x:clip;}
  body{margin:0;padding:0;font-family:${t.sans};-webkit-font-smoothing:antialiased;color:${t.text};}
  ::-webkit-scrollbar{width:10px;height:10px;}
  ::-webkit-scrollbar-thumb{background:#262d35;border-radius:99px;}
  input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:99px;background:#262d35;outline:none;}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#e7ebee;border:3px solid ${t.acc};cursor:pointer;}
  /* Mobile: prevent horizontal overflow and ensure full-width inputs */
  @media(max-width:768px){
    input,button,select,textarea{max-width:100%;}
    img,canvas{max-width:100%;}
  }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
