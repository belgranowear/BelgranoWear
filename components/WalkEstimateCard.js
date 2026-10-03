/**
 * F2 "¿Llego?": approximate walking time from the user's location to the origin
 * station versus the next departure (llegás / ajustado / no llegás). Always labelled
 * "aprox.". Contract (stub: renders nothing until implemented — owned by the walk area):
 *
 * @param {object} props
 * @param {{id:number,title:string,latitude?:number,longitude?:number}} props.station  Origin station.
 * @param {object} props.departure        dayjs instant of the next departure.
 * @param {object} [props.followingDeparture]  dayjs instant of the one after (shown when "no llegás").
 * @param {Function} [props.onRemindToLeave]   ({ leaveAt }) => void; shows "Avisarme cuándo salir".
 * @param {boolean} [props.compact]       Watch variant.
 * @param {object}  [props.style]
 */
export default function WalkEstimateCard() {
    return null;
}
