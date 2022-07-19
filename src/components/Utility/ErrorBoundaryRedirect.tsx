import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";



type ErrorBoundaryRedirectProps  = RouteComponentProps &{
    onErrorGoTo: string
    onError: () => void
}
class ErrorBoundaryRedirect extends Component<ErrorBoundaryRedirectProps>{

    componentDidCatch(error:any, info:any) {
        console.error(error, info);
        this.props.history.push(this.props.onErrorGoTo);
    }

    render(){
        return this.props.children;
    }
}

export default withRouter<ErrorBoundaryRedirectProps,any>(ErrorBoundaryRedirect)
