<?php

namespace App\Zoom;

final class ClassPolicy
{
    public const DEFAULT = ['passcode'=>false, 'waitingRoom'=>true, 'joinBeforeHost'=>false, 'recording'=>'account_default'];

    /** @return array<string, mixed> */
    public static function validate(mixed $policy): array
    {
        if (!is_array($policy) || !is_bool($policy['passcode'] ?? null) || !is_bool($policy['waitingRoom'] ?? null)
            || !is_bool($policy['joinBeforeHost'] ?? null) || !in_array($policy['recording'] ?? null,['account_default','none','cloud'],true)) {
            throw new \InvalidArgumentException('Réglages Zoom invalides.');
        }
        if (!$policy['waitingRoom'] && !$policy['passcode']) {
            throw new \InvalidArgumentException('Activez un code pour désactiver la salle d’attente.');
        }
        if ($policy['waitingRoom'] && $policy['joinBeforeHost']) {
            throw new \InvalidArgumentException('Désactivez la salle d’attente pour autoriser l’arrivée avant l’hôte.');
        }
        return array_intersect_key($policy,self::DEFAULT);
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, mixed> $policy
     *
     * @return array<string, mixed>
     */
    public static function apply(array $body,array $policy): array
    {
        $body['settings']['waiting_room']=$policy['waitingRoom'];
        $body['settings']['join_before_host']=$policy['joinBeforeHost'];
        if ($policy['joinBeforeHost']) {
            $body['settings']['jbh_time']=0;
        }
        if ($policy['recording']!=='account_default') {
            $body['settings']['auto_recording']=$policy['recording'];
        }
        if ($policy['passcode']) {
            $body['password']=(string)random_int(100000,999999);
        }
        return $body;
    }

    /**
     * @param array<string, mixed> $meeting
     *
     * @return array<string, mixed>
     */
    public static function effective(array $meeting): array
    {
        return [
            'passcode'=>array_key_exists('password',$meeting) ? (string)$meeting['password']!=='' : null,
            'waitingRoom'=>$meeting['settings']['waiting_room']??null,
            'joinBeforeHost'=>$meeting['settings']['join_before_host']??null,
            'recording'=>$meeting['settings']['auto_recording']??null,
            'registration'=>isset($meeting['settings']['approval_type']) ? (int)$meeting['settings']['approval_type']===0 : null,
        ];
    }
}
