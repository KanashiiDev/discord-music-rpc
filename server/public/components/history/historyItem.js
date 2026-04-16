import { fullDateTime, relativeTime, loadImage } from "../../utils.js";

export function createHistoryItem(entry) {
  const songDiv = document.createElement("div");
  songDiv.classList.add("song");

  const imageLink = document.createElement("a");
  if (entry.songUrl) {
    imageLink.href = entry.songUrl;
    imageLink.target = "_blank";
    imageLink.rel = "noopener noreferrer";
    imageLink.title = i18n.t("history.goToSong");
  }

  const imgContainer = document.createElement("div");
  imgContainer.className = "history-image-container spinner";

  const img = document.createElement("img");
  img.className = "song-image";
  img.alt = entry.title;
  img.loading = "lazy";
  img.decoding = "async";

  imgContainer.appendChild(img);

  const infoDiv = document.createElement("div");
  infoDiv.classList.add("song-info");

  const date = document.createElement("p");
  const dateLong = fullDateTime(entry.date);
  const dateAgo = relativeTime(entry.date);
  date.textContent = dateAgo;
  date.title = dateLong;
  date.classList.add("date");
  date.dataset.timestamp = entry.date instanceof Date ? entry.date.getTime() : entry.date;

  const title = document.createElement("h2");
  title.textContent = entry.title;
  title.classList.add("title");

  const artist = document.createElement("p");
  artist.textContent = entry.artist;
  artist.classList.add("artist");

  const source = document.createElement("p");
  source.textContent = entry.source;
  source.classList.add("source");

  imageLink.append(imgContainer);
  infoDiv.append(date, title, artist, source);
  songDiv.append(imageLink, infoDiv);
  loadImage({ target: img, src: entry.image });

  return songDiv;
}
