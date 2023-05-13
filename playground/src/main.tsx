/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:59:15
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-04-11 21:24:56
 */
import React from "react";
import ReactDOM from "react-dom";
// import App from "./App";
import "./index.css";

// @ts-ignore
// import.meta.hot.accept(() => {
//   ReactDOM.render(<App />, document.getElementById("root"));
// });
// ReactDOM.render(<App />, document.getElementById("root"));

const App = () => <div>hello 123546123</div>;

console.log(121356);

ReactDOM.render(<App />, document.getElementById("root"));

// @ts-ignore
import.meta.hot.accept(() => {
  ReactDOM.render(<App />, document.getElementById("root"));
});
