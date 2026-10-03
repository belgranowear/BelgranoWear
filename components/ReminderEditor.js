/**
 * F5 weekly reminder editor: route, days of week, departure time, lead time (5/10/15 min).
 * Bottom sheet on phone/tablet, linear 4-step flow on watch. Contract (stub: renders
 * nothing until implemented — owned by the reminders area):
 *
 * @param {object}   props
 * @param {boolean}  props.visible
 * @param {object}   [props.initialValue]  `{ id?, origin, destination, weekdays:number[] (1=Mon…7=Sun), time:'HH:mm', leadMinutes }`.
 * @param {Function} props.onSave          (value) => Promise|void
 * @param {Function} props.onDismiss
 */
export default function ReminderEditor() {
    return null;
}
