import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import styles from "./Song.module.css"
import { faSpotify, faYoutube } from "@fortawesome/free-brands-svg-icons"

export const Arrangement = ({data}: {data: Arrangement}) => {
    return <div className={styles.song}>
        {
            data.type === "single" ? <Song data={{
                title: data.title,
                artist: `${data.artist} - Arr ${data.arranger}`,
                links: data.links,
            }} />
                : <></>
        }
    </div>
}

export const Song = ({data}: {data: Song}) => {
    return <>
        <img src={`https://i.ytimg.com/vi/${data.links.youtube}/hqdefault.jpg`} className={styles.cover} />
        <div className={styles.details}>
            <b>{data.title}</b>
            <p>{data.artist}</p>
        </div>
        <SpotifyLink songId={data.links.spotify} />
        <YoutubeLink songId={data.links.youtube} />
    </>

}

const SpotifyLink = ({songId}: {songId: string}) => {
    return <a href={`https://open.spotify.com/track/${songId}`} target="_blank">
        <FontAwesomeIcon icon={faSpotify} color="#1ED760" size="2x" />
    </a>
}

const YoutubeLink = ({songId}: {songId: string}) => {
    return <a href={`https://music.youtube.com/watch?v=${songId}`} target="_blank">
        <FontAwesomeIcon icon={faYoutube} color="#FF0000" size="2x" />
    </a>
}