import ClientPage from '$pages/player';
import {PageBackground} from './_components/PageBackground';

export default function Page() {
    return <PageBackground page="Main"><ClientPage/></PageBackground>;
}
