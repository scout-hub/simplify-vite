/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:59:15
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-25 15:41:26
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// import "./index.css";
// @ts-ignore
// import.meta.hot.accept(() => {
//   ReactDOM.render(<App />, document.getElementById("root"));
// });
// ReactDOM.render(<App />, document.getElementById("root"));

// const App = () => <div>hello 123546123</div>;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
);

// @ts-ignore
// import.meta.hot.accept(() => {
//   ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
//     <App />
//   );
// });
