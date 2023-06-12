/*
 * @Author: Zhouqi
 * @Date: 2023-05-26 10:18:08
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-12 16:27:26
 */
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);

// @ts-ignore
if (import.meta.hot) {
    // @ts-ignore
    import.meta.hot.accept('./App',()=>{
        console.log('update');
        root.render(<App />);
    });
}
    