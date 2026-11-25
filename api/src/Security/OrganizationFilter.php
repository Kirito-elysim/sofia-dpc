<?php

namespace App\Security;

use App\Entity\{ClassSlot, Enrollment, Organization, Participant, Trainer, Training, VirtualClass};
use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

final class OrganizationFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $metadata, string $alias): string
    {
        $ids = $this->getParameterList('organizations');
        $classes = "SELECT scoped_class.id FROM virtual_class scoped_class JOIN training scoped_training ON scoped_training.id = scoped_class.training_id WHERE scoped_training.organization_id IN ($ids)";

        return match ($metadata->getName()) {
            Organization::class => "$alias.id IN ($ids)",
            Training::class => "$alias.organization_id IN ($ids)",
            Trainer::class => "EXISTS (SELECT 1 FROM trainer_organization scoped_trainer WHERE scoped_trainer.trainer_id = $alias.id AND scoped_trainer.organization_id IN ($ids))",
            VirtualClass::class => "$alias.training_id IN (SELECT id FROM training WHERE organization_id IN ($ids))",
            Enrollment::class, ClassSlot::class => "$alias.virtual_class_id IN ($classes)",
            Participant::class => "$alias.id IN (SELECT participant_id FROM enrollment WHERE virtual_class_id IN ($classes))",
            default => '',
        };
    }
}
