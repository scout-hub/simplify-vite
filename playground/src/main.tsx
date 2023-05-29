/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:59:15
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 10:52:35
 */
import ReactDOM from "react-dom/client";
// import App from "./App";
// import "./index.css";
// @ts-ignore
import.meta.hot.accept(() => {
  console.log(1);
});
// ReactDOM.render(<App />, document.getElementById("root"));

const App = () => <div>hello 123546123</div>;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
);
// @ts-ignore
console.log(import.meta.hot);
// @ts-ignore
// import.meta.hot.accept(() => {
//   ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
//     <App />
//   );
// });
