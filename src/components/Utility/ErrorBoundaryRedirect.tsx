import { NextRouter, useRouter } from "next/router";
import { Component, ReactElement } from "react";



type ErrorBoundaryRedirectProps = {
    onErrorGoTo: string
    onError: () => void
    children: ReactElement
}
type ErrorBoundaryRedirectPropsWithRouter = ErrorBoundaryRedirectProps & {
    router: NextRouter
}
type ErrorBoundaryRedirectState = {
    hasError: boolean
}

class ErrorBoundaryRedirect extends Component<ErrorBoundaryRedirectPropsWithRouter, ErrorBoundaryRedirectState>{

    constructor(props: ErrorBoundaryRedirectPropsWithRouter){
        super(props);
        this.state = { hasError: false };
    }
    componentDidCatch(error:any, info:any) {
        console.error(error, info);
        if(window.location.hostname === "localhost") return console.error("Prevent localhost redirect")
        this.props.router.push(this.props.onErrorGoTo);
    }
    static getDerivedStateFromError(error:any) {
        return { hasError: true };
    }

    render(){
        return this.props.children;
    }
}

export default function ErrorBoundaryRedirectWithRouter(props: ErrorBoundaryRedirectProps){
    const router = useRouter()
    return <ErrorBoundaryRedirect {...props} router={router} />
}

