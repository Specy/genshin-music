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
class ErrorBoundaryRedirect extends Component<ErrorBoundaryRedirectPropsWithRouter>{

    componentDidCatch(error:any, info:any) {
        console.error(error, info);
        if(window.location.hostname === "localhost") return console.error("Prevent localhost redirect")
        this.props.router.push(this.props.onErrorGoTo);
    }

    render(){
        return this.props.children;
    }
}

export default function ErrorBoundaryRedirectWithRouter(props: ErrorBoundaryRedirectProps){
    const router = useRouter()
    return <ErrorBoundaryRedirect {...props} router={router} />
}

