import { observable } from "mobx";
export const songStore = observable({
    data: {
        song: {},
        eventType: '',
        start: 0
    }
})