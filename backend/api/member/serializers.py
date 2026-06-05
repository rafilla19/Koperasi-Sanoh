from rest_framework import serializers


class UploadDocumentSerializer(serializers.Serializer):
    file = serializers.FileField()
    type = serializers.ChoiceField(choices=('npwp', 'ktp', 'transfer'))


class VerificationRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    fullName = serializers.CharField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, allow_blank=True)


class RegisterMemberSerializer(serializers.Serializer):
    nik = serializers.CharField()
    fullName = serializers.CharField()
    nikEmployee = serializers.CharField()
    noNpwp = serializers.CharField(required=False, allow_blank=True)
    placeOfBirth = serializers.CharField(required=False, allow_blank=True)
    dateOfBirth = serializers.CharField(required=False, allow_blank=True)
    gender = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    phoneNumber = serializers.CharField()
    email = serializers.EmailField()
    employeeStatusId = serializers.CharField()
    departmentId = serializers.CharField()
    voluntarySaving = serializers.CharField(required=False, allow_blank=True)
    contractEndDate = serializers.CharField(required=False, allow_blank=True)
    payrollAgreement = serializers.BooleanField(required=False)
    tncAgreement = serializers.BooleanField(required=False)
    password = serializers.CharField()
    npwpPath = serializers.CharField(required=False, allow_blank=True)
    ktpPath = serializers.CharField(required=False, allow_blank=True)


class MemberProfileUpdateSerializer(serializers.Serializer):
    member_id = serializers.IntegerField(required=False)
    phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False)
    bank_id = serializers.IntegerField(required=False, allow_null=True)
    acc_name = serializers.CharField(required=False, allow_blank=True)
    acc_no = serializers.CharField(required=False, allow_blank=True)


class MemberClosureRequestSerializer(serializers.Serializer):
    member_id = serializers.IntegerField()
    reason = serializers.CharField(required=False, allow_blank=True)


class VoluntarySavingRequestSerializer(serializers.Serializer):
    member_id = serializers.IntegerField()
    requested_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    demo_bypass = serializers.BooleanField(required=False)
