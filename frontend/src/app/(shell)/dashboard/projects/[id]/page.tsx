import { redirect } from 'next/navigation';

/** Legacy project detail links now enter the single Xroga workspace.
 * The workspace sidebar validates the user's project before creating a new task. */
export default async function ProjectDetailPage({params}:{
 params:Promise<{id:string}>;
}){
 const {id}=await params;
 redirect('/workspace?project='+encodeURIComponent(id));
}
