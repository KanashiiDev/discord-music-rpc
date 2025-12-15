function showSelectorChooser(scoredOptions, field, shadowDoc) {
  const root = shadowDoc.getElementById("userRpc-selectorRoot");
  const container = document.createElement("div");
  container.id = "userRpc-selectorChooser-container";

  const title = document.createElement("div");
  title.style.marginBottom = "6px";
  title.textContent = scoredOptions.length ? "Choose the most stable selector:" : "";
  container.appendChild(title);

  const containerList = document.createElement("div");
  containerList.id = "userRpc-selectorChooser-container-list";

  if (scoredOptions.length > 0) {
    scoredOptions.forEach(({ sel, score }) => {
      const btn = document.createElement("button");
      btn.id = "userRpc-selectorChooser-button";
      btn.className = "userRpc-optionButtons";

      const wrapper = document.createElement("div");
      wrapper.className = "wrapper";

      const selSpan = document.createElement("span");
      selSpan.className = "selector";
      selSpan.textContent = sel;

      const scoreSpan = document.createElement("span");
      scoreSpan.className = `score ${score >= 80 ? "green" : score >= 50 ? "orange" : "red"}`;
      scoreSpan.title = score >= 80 ? "Highly Reliable" : score >= 50 ? "Moderately Reliable" : "Unreliable";
      scoreSpan.textContent = `(${score})`;

      wrapper.appendChild(selSpan);
      wrapper.appendChild(scoreSpan);
      btn.appendChild(wrapper);

      btn.onclick = () => {
        const input = shadowDoc.getElementById(`${field}Selector`);
        if (input) input.value = sel;
        container.remove();
      };

      containerList.appendChild(btn);
    });
  } else {
    // Fallback Message
    const fallback = document.createElement("div");
    fallback.style.color = "#999";
    fallback.style.fontStyle = "italic";
    fallback.textContent = "No selector suggestions found.";
    containerList.appendChild(fallback);
  }

  // Cancel button
  const cancel = document.createElement("a");
  cancel.id = "userRpc-selectorChooser-cancel";
  cancel.className = "userRpc-optionButtons";
  cancel.textContent = scoredOptions.length ? "Cancel" : "Exit";
  cancel.onclick = () => container.remove();

  container.append(containerList, cancel);
  root.appendChild(container);
}
