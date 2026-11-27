<?php

namespace App\Security;

use App\Entity\{ClassSlot, Enrollment, Organization, Participant, Trainer, Formation, VirtualClass};
use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

final class OrganizationFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $metadata, string $alias): string
    {
        $ids = $this->getParameterList('organizations');
        $classes = "SELECT scoped_class.id FROM virtual_class scoped_class JOIN formation scoped_formation ON scoped_formation.id = scoped_class.formation_id WHERE scoped_formation.organization_id IN ($ids)";

        return match ($metadata->getName()) {
            Organization::class => "$alias.id IN ($ids)",
            Formation::class => "$alias.organization_id IN ($ids)",
            Trainer::class => "EXISTS (SELECT 1 FROM trainer_organization scoped_trainer WHERE scoped_trainer.trainer_id = $alias.id AND scoped_trainer.organization_id IN ($ids))",
            VirtualClass::class => "$alias.formation_id IN (SELECT id FROM formation WHERE organization_id IN ($ids))",
            Enrollment::class, ClassSlot::class => "$alias.virtual_class_id IN ($classes)",
            Participant::class => "$alias.id IN (SELECT participant_id FROM enrollment WHERE virtual_class_id IN ($classes))",
            default => '',
        };
    }
}
