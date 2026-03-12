"use client";

import { StudioExperience } from "@/app/studio/page";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";

export default function ChatbotPage() {
  return (
    <TemplatePageContent className="pt-[96px]">
      <StudioExperience
        initialMediaMode="image"
        initialMediaModalOpen={false}
        initialVoicePopupOpen={false}
        initialVoiceMode={false}
        embedded
      />
      <TemplateCopyright />
    </TemplatePageContent>
  );
}
