import type { ReactNode } from "react";
import { fetchData } from "../data/Data";
import styles from "./DataView.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpotify, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { Arrangement } from "./Song";

export const DataView = ({band}: {band: Band}) => {
    const data = fetchData(band);
    console.log(data);
    return <div className={styles.dataview}>
        {
            Object.keys(data).map(year => <Year data={data[year]} year={year}/>)
        }
    </div>
}

const Year = ({data, year}: {data: YearData, year: string}) => {
    return <Section title={year}>
        {
            Object.values(data).map(section => <Ensamble data={section}/>)
        }
    </Section>
}

const Ensamble = ({data}: {data: SectionData}) => {
    return <Section title={data.title}>
        {
            data.arrangements.map(arrangement => <Arrangement data={arrangement} />)
        }
    </Section>
}

export const Section = ({title, children}: {title: string, children?: ReactNode[] | ReactNode}) => {
    return <details>
        <summary>{title}</summary>
        {children}
    </details>
}