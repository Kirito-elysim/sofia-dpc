<?php

namespace App\Security;

use App\Entity\{ClassSlot, Enrollment, Organization, Participant, Registration, Session, SessionFormation, Trainer, Formation, VirtualClass};
use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

final class OrganizationFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $metadata, string $alias): string
    {
        $ids = $this->getParameterList('organizations');
        $classes = "SELECT scoped_class.id FROM virtual_class scoped_class WHERE scoped_class.organization_id IN ($ids)";

        $offers = "SELECT scoped_offer.id FROM session_formation scoped_offer JOIN session scoped_session ON scoped_session.id = scoped_offer.session_id WHERE scoped_session.organization_id IN ($ids)";

        return match ($metadata->getName()) {
            Organization::class => "$alias.id IN ($ids)",
            Formation::class, Session::class => "$alias.organization_id IN ($ids)",
            SessionFormation::class => "$alias.session_id IN (SELECT id FROM session WHERE organization_id IN ($ids))",
            Trainer::class => "EXISTS (SELECT 1 FROM trainer_organization scoped_trainer WHERE scoped_trainer.trainer_id = $alias.id AND scoped_trainer.organization_id IN ($ids))",
            VirtualClass::class => "$alias.organization_id IN ($ids)",
            Enrollment::class, ClassSlot::class => "$alias.virtual_class_id IN ($classes)",
            Registration::class => "$alias.session_formation_id IN ($offers)",
            Participant::class => "$alias.id IN (SELECT participant_id FROM enrollment WHERE virtual_class_id IN ($classes) UNION SELECT participant_id FROM registration WHERE session_formation_id IN ($offers))",
            default => '',
        };
    }
}
