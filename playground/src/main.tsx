/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:59:15
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-01 17:32:21
*/
import ReactDOM from "react-dom/client";
import App from "./App";
// import "./index.css";
// ReactDOM.render(<App />, document.getElementById("root"));

// const App = () => <div>hello 123546123</div>;
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);