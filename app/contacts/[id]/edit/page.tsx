import { getContact } from "@/app/actions";
import { ContactForm } from "@/components/contacts/ContactForm";
import { notFound } from "next/navigation";

export default async function EditContactPage(props: {
    params: Promise<{ id: string }>;
}) {
    const params = await props.params;
    const id = parseInt(params.id);
    const contact = await getContact(id);

    if (!contact) {
        notFound();
    }

    return (
        <div className="pt-4">
            <ContactForm initialData={contact} />
        </div>
    );
}
