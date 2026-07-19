import {useAppNavigation} from "$/app/_navigation/NavigationProvider";
import type {AppNavigation} from "$/app/_navigation/types";
import {Component, type ErrorInfo, type ReactElement} from "react";


type ErrorBoundaryRedirectProps = {
    onErrorGoTo: string
    onError: () => void
    children: ReactElement
}
type ErrorBoundaryRedirectPropsWithNavigation = ErrorBoundaryRedirectProps & {
    pushWithoutGuard: AppNavigation['pushWithoutGuard']
}
type ErrorBoundaryRedirectState = {
    hasError: boolean
}

class ErrorBoundaryRedirect extends Component<ErrorBoundaryRedirectPropsWithNavigation, ErrorBoundaryRedirectState> {

    constructor(props: ErrorBoundaryRedirectPropsWithNavigation) {
        super(props)
        this.state = {hasError: false};
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(error, info);
        this.props.onError()
        if (window.location.hostname === "localhost") return console.error("Prevent localhost redirect")
        this.props.pushWithoutGuard(this.props.onErrorGoTo)
    }

    static getDerivedStateFromError(): ErrorBoundaryRedirectState {
        return {hasError: true};
    }

    render() {
        return this.props.children;
    }
}

export default function ErrorBoundaryRedirectWithNavigation(props: ErrorBoundaryRedirectProps) {
    const {pushWithoutGuard} = useAppNavigation()
    return <ErrorBoundaryRedirect {...props} pushWithoutGuard={pushWithoutGuard}/>
}

