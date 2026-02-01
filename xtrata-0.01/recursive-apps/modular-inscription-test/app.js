// app.js
  export function startApp(root, data) {
    const title = document.createElement("h2");
    title.textContent = "Recursive Demo App";
    root.appendChild(title);

    const list = document.createElement("ul");
    data.items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    root.appendChild(list);
  }