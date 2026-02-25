import { fullDateTime, relativeTime } from "../../utils.js";

export function createHistoryItem(entry) {
  const songDiv = document.createElement("div");
  songDiv.classList.add("song");

  const imageLink = document.createElement("a");
  if (entry.songUrl) {
    imageLink.href = entry.songUrl;
    imageLink.target = "_blank";
    imageLink.rel = "noopener noreferrer";
    imageLink.title = "Go to the song";
  }

  const img = document.createElement("img");
  img.className = "song-image lazyload";
  img.dataset.src = entry.image || "assets/icon-dark.png";
  img.src = "assets/icon-dark.png";
  img.alt = entry.title;
  img.onerror = function () {
    this.onerror = null;
    this.src = "assets/icon-dark.png";
  };

  const infoDiv = document.createElement("div");
  infoDiv.classList.add("song-info");

  const date = document.createElement("p");
  const dateLong = fullDateTime(entry.date);
  const dateAgo = relativeTime(entry.date);
  date.textContent = dateAgo;
  date.title = dateLong;
  date.classList.add("date");

  const title = document.createElement("h2");
  title.textContent = entry.title;
  title.classList.add("title");

  const artist = document.createElement("p");
  artist.textContent = entry.artist;
  artist.classList.add("artist");

  const source = document.createElement("p");
  source.textContent = entry.source;
  source.classList.add("source");

  imageLink.append(img);
  infoDiv.append(date, title, artist, source);
  songDiv.append(imageLink, infoDiv);

  return songDiv;
}
