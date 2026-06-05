import { getContacts, getProjects } from "@/app/actions";
import { ProformaForm } from "@/components/proformas/ProformaForm";

export default async function NewProformaPage() {
  const [contacts, projects] = await Promise.all([
    getContacts({ type: "CLIENT" as any }),
    getProjects(),
  ]);

  return <ProformaForm contacts={contacts} projects={projects} />;
}
