"use client";

import { StudioExperience } from "@/app/studio/page";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";

export default function VoiceGeneratorPage() {
  return (
    <TemplatePageContent className="pt-[96px]">
      <StudioExperience
        initialMediaMode="audio"
        initialMediaModalOpen={false}
        initialVoicePopupOpen
        initialVoiceMode
        embedded
      />
      <TemplateCopyright />
    </TemplatePageContent>
  );
}
