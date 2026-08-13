from django.db import migrations

# ---------------------------------------------------------------------------
# Denda telat (late-payment penalty) for Simpanan Wajib.
#
# These 5 functions/procedures previously only existed live in Postgres
# (created outside any migration). This migration is their first tracked
# source of truth. It fixes two live bugs while wiring up the penalty:
#
# 1. sp_generate_bills used to insert a brand-new, unpaid bill directly as
#    OVERDUE (status_id=40) if generated after the 27th of its period. Every
#    other procedure treats status_id IN (39,40) as "already paid", so those
#    bills became permanently un-payable. Bills now always start UNPAID (38);
#    OVERDUE is only ever reached by an actual late payment.
# 2. sp_savings_payroll_transaction / sp_manual_savings_transaction /
#    sp_savings_gateway_payment referenced funding_settings.effective_date,
#    a column that doesn't exist, so confirming any late payment crashed.
#    That lookup is fixed, and gated to saving_type_id=1 (Simpanan Wajib
#    only) so Sukarela/Pokok bills paid late never get a penalty.
# 3. sp_rollback_savings_payroll_transaction now also clears penalty_due/
#    penalty_paid when it resets a bill back to UNPAID, so a rollback
#    doesn't leave stale denda data behind.
# ---------------------------------------------------------------------------

SP_GENERATE_BILLS_FORWARD = r"""
CREATE OR REPLACE FUNCTION public.sp_generate_bills(p_member_ids integer[], p_month integer, p_year integer)
 RETURNS TABLE(generated_count integer, skipped_count integer, error_messages text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_member_id          INTEGER;
    v_bill_period_start  DATE;
    v_bill_period_end    DATE;
    v_initial_status_id  INTEGER;

    v_status_unpaid      INTEGER;
    v_status_overdue     INTEGER;
    v_status_paid        INTEGER;

    v_mandatory_type_id  INTEGER;
    v_voluntary_type_id  INTEGER;
    v_principal_type_id  INTEGER;

    v_employee_status_id INTEGER;
    v_join_month         INTEGER;
    v_join_year          INTEGER;
    v_amount             NUMERIC(15,2);
    v_bill_exists        BOOLEAN;
    v_already_paid       BOOLEAN;

    v_generated          INTEGER := 0;
    v_skipped            INTEGER := 0;
    v_errors             TEXT    := '';
BEGIN
    IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'p_member_ids tidak boleh kosong';
    END IF;
    IF p_month NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'p_month harus antara 1-12';
    END IF;

    v_bill_period_start := MAKE_DATE(p_year, p_month, 1);
    v_bill_period_end   := MAKE_DATE(p_year, p_month, 27);

    SELECT id INTO v_status_unpaid  FROM statuses WHERE status_code = 'UNPAID'  AND status_category_id = 3;
    SELECT id INTO v_status_overdue FROM statuses WHERE status_code = 'OVERDUE' AND status_category_id = 3;
    SELECT id INTO v_status_paid    FROM statuses WHERE status_code = 'PAID'    AND status_category_id = 3;

    IF v_status_unpaid IS NULL OR v_status_overdue IS NULL OR v_status_paid IS NULL THEN
        RAISE EXCEPTION 'Status UNPAID/OVERDUE/PAID (category_id=3) tidak ditemukan';
    END IF;

    -- Bills always start UNPAID. OVERDUE is only ever set by a payment
    -- procedure when it detects an actual late payment (see denda telat
    -- fix below) -- never at generation time with amount_paid=0.
    v_initial_status_id := v_status_unpaid;

    SELECT id INTO v_mandatory_type_id FROM saving_types WHERE name ILIKE '%MANDATORY%' AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_voluntary_type_id FROM saving_types WHERE name ILIKE '%VOLUNTARY%' AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_principal_type_id FROM saving_types WHERE name ILIKE '%PRINCIPLE%'  AND deleted_at IS NULL LIMIT 1;

    FOREACH v_member_id IN ARRAY p_member_ids LOOP
        BEGIN
            SELECT employee_status_id,
                   EXTRACT(MONTH FROM join_date)::INTEGER,
                   EXTRACT(YEAR  FROM join_date)::INTEGER
            INTO   v_employee_status_id, v_join_month, v_join_year
            FROM   members
            WHERE  id = v_member_id AND deleted_at IS NULL;

            IF NOT FOUND THEN
                v_errors  := v_errors || format('Member %s tidak ditemukan. ', v_member_id);
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;

            -- 1. SIMPANAN POKOK (hanya member baru bulan ini)
            IF v_principal_type_id IS NOT NULL
               AND v_join_year  = p_year
               AND v_join_month = p_month
            THEN
                SELECT EXISTS(
                    SELECT 1 FROM monthly_saving_bills
                    WHERE  member_id      = v_member_id
                      AND  saving_type_id = v_principal_type_id
                      AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                      AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                      AND  deleted_at IS NULL
                ) INTO v_bill_exists;

                IF NOT v_bill_exists THEN
                    SELECT COALESCE(minimum_amount, 0) INTO v_amount
                    FROM   saving_types WHERE id = v_principal_type_id;

                    INSERT INTO monthly_saving_bills (
                        member_id, saving_type_id,
                        bill_period_start, bill_period_end,
                        amount_due, amount_paid,
                        status_id, due_date,
                        created_at, updated_at, deleted_at
                    ) VALUES (
                        v_member_id, v_principal_type_id,
                        v_bill_period_start, v_bill_period_end,
                        v_amount, 0,
                        v_initial_status_id, v_bill_period_end,
                        NOW(), NOW(), NULL
                    )
                    ON CONFLICT ON CONSTRAINT unique_member_bill
                    DO UPDATE SET
                        amount_due  = EXCLUDED.amount_due,
                        amount_paid = 0,
                        status_id   = EXCLUDED.status_id,
                        due_date    = EXCLUDED.due_date,
                        updated_at  = NOW(),
                        deleted_at  = NULL;
                    v_generated := v_generated + 1;
                ELSE
                    v_skipped := v_skipped + 1;
                END IF;
            END IF;

            -- 2. SIMPANAN WAJIB
            IF v_mandatory_type_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM monthly_saving_bills
                    WHERE  member_id      = v_member_id
                      AND  saving_type_id = v_mandatory_type_id
                      AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                      AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                      AND  status_id     = v_status_paid
                      AND  deleted_at IS NULL
                ) INTO v_already_paid;

                IF v_already_paid THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    SELECT EXISTS(
                        SELECT 1 FROM monthly_saving_bills
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_mandatory_type_id
                          AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                          AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                          AND  deleted_at IS NULL
                    ) INTO v_bill_exists;

                    IF NOT v_bill_exists THEN
                        SELECT monthly_amount INTO v_amount
                        FROM   member_saving_obligations
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_mandatory_type_id
                          AND  is_active      = TRUE
                          AND  deleted_at IS NULL
                        LIMIT 1;

                        IF COALESCE(v_amount, 0) > 0 THEN
                            INSERT INTO monthly_saving_bills (
                                member_id, saving_type_id,
                                bill_period_start, bill_period_end,
                                amount_due, amount_paid,
                                status_id, due_date,
                                created_at, updated_at, deleted_at
                            ) VALUES (
                                v_member_id, v_mandatory_type_id,
                                v_bill_period_start, v_bill_period_end,
                                v_amount, 0,
                                v_initial_status_id, v_bill_period_end,
                                NOW(), NOW(), NULL
                            )
                            ON CONFLICT ON CONSTRAINT unique_member_bill
                            DO UPDATE SET
                                amount_due  = EXCLUDED.amount_due,
                                amount_paid = 0,
                                status_id   = EXCLUDED.status_id,
                                due_date    = EXCLUDED.due_date,
                                updated_at  = NOW(),
                                deleted_at  = NULL;
                            v_generated := v_generated + 1;
                        END IF;
                    ELSE
                        v_skipped := v_skipped + 1;
                    END IF;
                END IF;
            END IF;

            -- 3. SIMPANAN SUKARELA
            IF v_voluntary_type_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM monthly_saving_bills
                    WHERE  member_id      = v_member_id
                      AND  saving_type_id = v_voluntary_type_id
                      AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                      AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                      AND  status_id     = v_status_paid
                      AND  deleted_at IS NULL
                ) INTO v_already_paid;

                IF NOT v_already_paid THEN
                    SELECT EXISTS(
                        SELECT 1 FROM monthly_saving_bills
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_voluntary_type_id
                          AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                          AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                          AND  deleted_at IS NULL
                    ) INTO v_bill_exists;

                    IF NOT v_bill_exists THEN
                        SELECT monthly_amount INTO v_amount
                        FROM   member_saving_obligations
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_voluntary_type_id
                          AND  is_active      = TRUE
                          AND  deleted_at IS NULL
                        LIMIT 1;

                        IF COALESCE(v_amount, 0) > 0 THEN
                            INSERT INTO monthly_saving_bills (
                                member_id, saving_type_id,
                                bill_period_start, bill_period_end,
                                amount_due, amount_paid,
                                status_id, due_date,
                                created_at, updated_at, deleted_at
                            ) VALUES (
                                v_member_id, v_voluntary_type_id,
                                v_bill_period_start, v_bill_period_end,
                                v_amount, 0,
                                v_initial_status_id, v_bill_period_end,
                                NOW(), NOW(), NULL
                            )
                            ON CONFLICT ON CONSTRAINT unique_member_bill
                            DO UPDATE SET
                                amount_due  = EXCLUDED.amount_due,
                                amount_paid = 0,
                                status_id   = EXCLUDED.status_id,
                                due_date    = EXCLUDED.due_date,
                                updated_at  = NOW(),
                                deleted_at  = NULL;
                            v_generated := v_generated + 1;
                        END IF;
                    ELSE
                        v_skipped := v_skipped + 1;
                    END IF;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_errors  := v_errors || format('Member %s error: %s. ', v_member_id, SQLERRM);
        END;
    END LOOP;

    RETURN QUERY SELECT v_generated, v_skipped, NULLIF(TRIM(v_errors), '');
END;
$function$
"""

SP_GENERATE_BILLS_REVERSE = r"""
CREATE OR REPLACE FUNCTION public.sp_generate_bills(p_member_ids integer[], p_month integer, p_year integer)
 RETURNS TABLE(generated_count integer, skipped_count integer, error_messages text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_member_id          INTEGER;
    v_bill_period_start  DATE;
    v_bill_period_end    DATE;
    v_initial_status_id  INTEGER;

    v_status_unpaid      INTEGER;
    v_status_overdue     INTEGER;
    v_status_paid        INTEGER;

    v_mandatory_type_id  INTEGER;
    v_voluntary_type_id  INTEGER;
    v_principal_type_id  INTEGER;

    v_employee_status_id INTEGER;
    v_join_month         INTEGER;
    v_join_year          INTEGER;
    v_amount             NUMERIC(15,2);
    v_bill_exists        BOOLEAN;
    v_already_paid       BOOLEAN;

    v_generated          INTEGER := 0;
    v_skipped            INTEGER := 0;
    v_errors             TEXT    := '';
BEGIN
    IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'p_member_ids tidak boleh kosong';
    END IF;
    IF p_month NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'p_month harus antara 1-12';
    END IF;

    v_bill_period_start := MAKE_DATE(p_year, p_month, 1);
    v_bill_period_end   := MAKE_DATE(p_year, p_month, 27);

    SELECT id INTO v_status_unpaid  FROM statuses WHERE status_code = 'UNPAID'  AND status_category_id = 3;
    SELECT id INTO v_status_overdue FROM statuses WHERE status_code = 'OVERDUE' AND status_category_id = 3;
    SELECT id INTO v_status_paid    FROM statuses WHERE status_code = 'PAID'    AND status_category_id = 3;

    IF v_status_unpaid IS NULL OR v_status_overdue IS NULL OR v_status_paid IS NULL THEN
        RAISE EXCEPTION 'Status UNPAID/OVERDUE/PAID (category_id=3) tidak ditemukan';
    END IF;

    v_initial_status_id := CASE
        WHEN CURRENT_DATE > v_bill_period_end THEN v_status_overdue
        ELSE v_status_unpaid
    END;

    SELECT id INTO v_mandatory_type_id FROM saving_types WHERE name ILIKE '%MANDATORY%' AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_voluntary_type_id FROM saving_types WHERE name ILIKE '%VOLUNTARY%' AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_principal_type_id FROM saving_types WHERE name ILIKE '%PRINCIPLE%'  AND deleted_at IS NULL LIMIT 1;

    FOREACH v_member_id IN ARRAY p_member_ids LOOP
        BEGIN
            SELECT employee_status_id,
                   EXTRACT(MONTH FROM join_date)::INTEGER,
                   EXTRACT(YEAR  FROM join_date)::INTEGER
            INTO   v_employee_status_id, v_join_month, v_join_year
            FROM   members
            WHERE  id = v_member_id AND deleted_at IS NULL;

            IF NOT FOUND THEN
                v_errors  := v_errors || format('Member %s tidak ditemukan. ', v_member_id);
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;

            -- 1. SIMPANAN POKOK (hanya member baru bulan ini)
            IF v_principal_type_id IS NOT NULL
               AND v_join_year  = p_year
               AND v_join_month = p_month
            THEN
                SELECT EXISTS(
                    SELECT 1 FROM monthly_saving_bills
                    WHERE  member_id      = v_member_id
                      AND  saving_type_id = v_principal_type_id
                      AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                      AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                      AND  deleted_at IS NULL
                ) INTO v_bill_exists;

                IF NOT v_bill_exists THEN
                    SELECT COALESCE(minimum_amount, 0) INTO v_amount
                    FROM   saving_types WHERE id = v_principal_type_id;

                    INSERT INTO monthly_saving_bills (
                        member_id, saving_type_id,
                        bill_period_start, bill_period_end,
                        amount_due, amount_paid,
                        status_id, due_date,
                        created_at, updated_at, deleted_at
                    ) VALUES (
                        v_member_id, v_principal_type_id,
                        v_bill_period_start, v_bill_period_end,
                        v_amount, 0,
                        v_initial_status_id, v_bill_period_end,
                        NOW(), NOW(), NULL
                    )
                    ON CONFLICT ON CONSTRAINT unique_member_bill
                    DO UPDATE SET
                        amount_due  = EXCLUDED.amount_due,
                        amount_paid = 0,
                        status_id   = EXCLUDED.status_id,
                        due_date    = EXCLUDED.due_date,
                        updated_at  = NOW(),
                        deleted_at  = NULL;
                    v_generated := v_generated + 1;
                ELSE
                    v_skipped := v_skipped + 1;
                END IF;
            END IF;

            -- 2. SIMPANAN WAJIB
            IF v_mandatory_type_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM monthly_saving_bills
                    WHERE  member_id      = v_member_id
                      AND  saving_type_id = v_mandatory_type_id
                      AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                      AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                      AND  status_id     = v_status_paid
                      AND  deleted_at IS NULL
                ) INTO v_already_paid;

                IF v_already_paid THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    SELECT EXISTS(
                        SELECT 1 FROM monthly_saving_bills
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_mandatory_type_id
                          AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                          AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                          AND  deleted_at IS NULL
                    ) INTO v_bill_exists;

                    IF NOT v_bill_exists THEN
                        SELECT monthly_amount INTO v_amount
                        FROM   member_saving_obligations
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_mandatory_type_id
                          AND  is_active      = TRUE
                          AND  deleted_at IS NULL
                        LIMIT 1;

                        IF COALESCE(v_amount, 0) > 0 THEN
                            INSERT INTO monthly_saving_bills (
                                member_id, saving_type_id,
                                bill_period_start, bill_period_end,
                                amount_due, amount_paid,
                                status_id, due_date,
                                created_at, updated_at, deleted_at
                            ) VALUES (
                                v_member_id, v_mandatory_type_id,
                                v_bill_period_start, v_bill_period_end,
                                v_amount, 0,
                                v_initial_status_id, v_bill_period_end,
                                NOW(), NOW(), NULL
                            )
                            ON CONFLICT ON CONSTRAINT unique_member_bill
                            DO UPDATE SET
                                amount_due  = EXCLUDED.amount_due,
                                amount_paid = 0,
                                status_id   = EXCLUDED.status_id,
                                due_date    = EXCLUDED.due_date,
                                updated_at  = NOW(),
                                deleted_at  = NULL;
                            v_generated := v_generated + 1;
                        END IF;
                    ELSE
                        v_skipped := v_skipped + 1;
                    END IF;
                END IF;
            END IF;

            -- 3. SIMPANAN SUKARELA
            IF v_voluntary_type_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM monthly_saving_bills
                    WHERE  member_id      = v_member_id
                      AND  saving_type_id = v_voluntary_type_id
                      AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                      AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                      AND  status_id     = v_status_paid
                      AND  deleted_at IS NULL
                ) INTO v_already_paid;

                IF NOT v_already_paid THEN
                    SELECT EXISTS(
                        SELECT 1 FROM monthly_saving_bills
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_voluntary_type_id
                          AND  EXTRACT(MONTH FROM bill_period_start) = p_month
                          AND  EXTRACT(YEAR  FROM bill_period_start) = p_year
                          AND  deleted_at IS NULL
                    ) INTO v_bill_exists;

                    IF NOT v_bill_exists THEN
                        SELECT monthly_amount INTO v_amount
                        FROM   member_saving_obligations
                        WHERE  member_id      = v_member_id
                          AND  saving_type_id = v_voluntary_type_id
                          AND  is_active      = TRUE
                          AND  deleted_at IS NULL
                        LIMIT 1;

                        IF COALESCE(v_amount, 0) > 0 THEN
                            INSERT INTO monthly_saving_bills (
                                member_id, saving_type_id,
                                bill_period_start, bill_period_end,
                                amount_due, amount_paid,
                                status_id, due_date,
                                created_at, updated_at, deleted_at
                            ) VALUES (
                                v_member_id, v_voluntary_type_id,
                                v_bill_period_start, v_bill_period_end,
                                v_amount, 0,
                                v_initial_status_id, v_bill_period_end,
                                NOW(), NOW(), NULL
                            )
                            ON CONFLICT ON CONSTRAINT unique_member_bill
                            DO UPDATE SET
                                amount_due  = EXCLUDED.amount_due,
                                amount_paid = 0,
                                status_id   = EXCLUDED.status_id,
                                due_date    = EXCLUDED.due_date,
                                updated_at  = NOW(),
                                deleted_at  = NULL;
                            v_generated := v_generated + 1;
                        END IF;
                    ELSE
                        v_skipped := v_skipped + 1;
                    END IF;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_errors  := v_errors || format('Member %s error: %s. ', v_member_id, SQLERRM);
        END;
    END LOOP;

    RETURN QUERY SELECT v_generated, v_skipped, NULLIF(TRIM(v_errors), '');
END;
$function$
"""

SP_PAYROLL_FORWARD = r"""
CREATE OR REPLACE PROCEDURE public.sp_savings_payroll_transaction(IN p_bill_id integer, IN p_member_id integer, IN p_saving_type_id integer, IN file_pay character varying DEFAULT NULL::character varying, IN p_admin_id integer DEFAULT NULL::integer)
 LANGUAGE plpgsql
AS $procedure$

DECLARE
    v_amount NUMERIC;
    v_reference_code VARCHAR(50);
    v_due_date DATE;
    v_penalty NUMERIC(15,2) := 0;

BEGIN

    RAISE NOTICE 'START SAVINGS PAYROLL TRANSACTION';

    IF NOT EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id) THEN
        RAISE EXCEPTION 'BILL NOT FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id AND status_id IN (39,40)) THEN
        RAISE EXCEPTION 'BILL ALREADY PAID';
    END IF;

    SELECT amount_due, bill_period_end
    INTO v_amount, v_due_date
    FROM monthly_saving_bills
    WHERE id = p_bill_id AND member_id = p_member_id AND saving_type_id = p_saving_type_id
    FOR UPDATE;

    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'INVALID MEMBER OR SAVING TYPE';
    END IF;

    RAISE NOTICE 'AMOUNT: %', v_amount;

    -- DENDA TELAT BAYAR (melewati due_date / tgl 27) DIAMBIL DARI funding_settings id=3
    -- Simpanan Wajib (saving_type_id=1) saja yang kena denda.
    IF v_due_date < CURRENT_DATE AND p_saving_type_id = 1 THEN
        SELECT monthly_limit INTO v_penalty
        FROM funding_settings
        WHERE id = 3
          AND is_active = TRUE
        LIMIT 1;

        v_penalty := COALESCE(v_penalty, 0);
    END IF;

    RAISE NOTICE 'PENALTY (DENDA TELAT): %', v_penalty;

    v_reference_code := 'SAV-PAYROLL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('saving_payment_ref_seq')::TEXT, 5, '0');
    RAISE NOTICE 'REFERENCE CODE: %', v_reference_code;

    INSERT INTO saving_transactions (
        member_id, saving_type_id, transaction_type_id, payment_method_id,
        amount, status_id, payment_reference_id, monthly_saving_bill_id,
        transaction_date, created_at, updated_at
    )
    VALUES (p_member_id, p_saving_type_id, 1, 2, v_amount, 34, v_reference_code, p_bill_id, NOW(), NOW(), NOW());

    RAISE NOTICE 'SAVING TRANSACTION INSERTED';

    IF file_pay IS NOT NULL THEN
        INSERT INTO manual_payments (
            payable_type_id, payment_method_id, notes, proof_file_path,
            payment_reference_id, verified_by, verified_at, created_at, updated_at
        )
        VALUES (1, 2, 'Bukti transfer potongan payroll', file_pay, v_reference_code, p_admin_id, NOW(), NOW(), NOW());
        RAISE NOTICE 'PAYROLL PROOF RECORDED';
    END IF;

    INSERT INTO saving_wallets (member_id, saving_type_id, balance, last_updated, created_at)
    VALUES (p_member_id, p_saving_type_id, v_amount, NOW(), NOW())
    ON CONFLICT (member_id, saving_type_id)
    DO UPDATE SET balance = saving_wallets.balance + EXCLUDED.balance, last_updated = NOW();

    RAISE NOTICE 'WALLET UPDATED';

    UPDATE monthly_saving_bills
    SET
        amount_paid = v_amount,
        penalty_due = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_due END,
        penalty_paid = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_paid END,
        status_id = CASE WHEN v_due_date < CURRENT_DATE THEN 40 ELSE 39 END,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_bill_id;

    RAISE NOTICE 'BILL UPDATED';
    RAISE NOTICE 'PAYROLL SAVING SUCCESS';

END;

$procedure$
"""

SP_PAYROLL_REVERSE = r"""
CREATE OR REPLACE PROCEDURE public.sp_savings_payroll_transaction(IN p_bill_id integer, IN p_member_id integer, IN p_saving_type_id integer, IN file_pay character varying DEFAULT NULL::character varying, IN p_admin_id integer DEFAULT NULL::integer)
 LANGUAGE plpgsql
AS $procedure$

DECLARE
    v_amount NUMERIC;
    v_reference_code VARCHAR(50);
    v_due_date DATE;
    v_penalty NUMERIC(15,2) := 0;

BEGIN

    RAISE NOTICE 'START SAVINGS PAYROLL TRANSACTION';

    IF NOT EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id) THEN
        RAISE EXCEPTION 'BILL NOT FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id AND status_id IN (39,40)) THEN
        RAISE EXCEPTION 'BILL ALREADY PAID';
    END IF;

    SELECT amount_due, bill_period_end
    INTO v_amount, v_due_date
    FROM monthly_saving_bills
    WHERE id = p_bill_id AND member_id = p_member_id AND saving_type_id = p_saving_type_id
    FOR UPDATE;

    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'INVALID MEMBER OR SAVING TYPE';
    END IF;

    RAISE NOTICE 'AMOUNT: %', v_amount;

    -- DENDA TELAT BAYAR (melewati due_date / tgl 27) DIAMBIL DARI funding_settings id=3
    IF v_due_date < CURRENT_DATE THEN
        SELECT monthly_limit INTO v_penalty
        FROM funding_settings
        WHERE id = 3
          AND is_active = TRUE
          AND effective_date >= CURRENT_DATE
        ORDER BY effective_date ASC
        LIMIT 1;

        v_penalty := COALESCE(v_penalty, 0);
    END IF;

    RAISE NOTICE 'PENALTY (DENDA TELAT): %', v_penalty;

    v_reference_code := 'SAV-PAYROLL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('saving_payment_ref_seq')::TEXT, 5, '0');
    RAISE NOTICE 'REFERENCE CODE: %', v_reference_code;

    INSERT INTO saving_transactions (
        member_id, saving_type_id, transaction_type_id, payment_method_id,
        amount, status_id, payment_reference_id, monthly_saving_bill_id,
        transaction_date, created_at, updated_at
    )
    VALUES (p_member_id, p_saving_type_id, 1, 2, v_amount, 34, v_reference_code, p_bill_id, NOW(), NOW(), NOW());

    RAISE NOTICE 'SAVING TRANSACTION INSERTED';

    IF file_pay IS NOT NULL THEN
        INSERT INTO manual_payments (
            payable_type_id, payment_method_id, notes, proof_file_path,
            payment_reference_id, verified_by, verified_at, created_at, updated_at
        )
        VALUES (1, 2, 'Bukti transfer potongan payroll', file_pay, v_reference_code, p_admin_id, NOW(), NOW(), NOW());
        RAISE NOTICE 'PAYROLL PROOF RECORDED';
    END IF;

    INSERT INTO saving_wallets (member_id, saving_type_id, balance, last_updated, created_at)
    VALUES (p_member_id, p_saving_type_id, v_amount, NOW(), NOW())
    ON CONFLICT (member_id, saving_type_id)
    DO UPDATE SET balance = saving_wallets.balance + EXCLUDED.balance, last_updated = NOW();

    RAISE NOTICE 'WALLET UPDATED';

    UPDATE monthly_saving_bills
    SET
        amount_paid = v_amount,
        penalty_due = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_due END,
        penalty_paid = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_paid END,
        status_id = CASE WHEN v_due_date < CURRENT_DATE THEN 40 ELSE 39 END,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_bill_id;

    RAISE NOTICE 'BILL UPDATED';
    RAISE NOTICE 'PAYROLL SAVING SUCCESS';

END;

$procedure$
"""

SP_MANUAL_FORWARD = r"""
CREATE OR REPLACE PROCEDURE public.sp_manual_savings_transaction(IN p_bill_id integer, IN p_member_id integer, IN p_saving_type_id integer, IN file_pay character varying, IN p_admin_id integer, IN p_notes text)
 LANGUAGE plpgsql
AS $procedure$

DECLARE
    v_amount NUMERIC;
    v_reference_code VARCHAR(50);
    v_due_date DATE;
    v_penalty NUMERIC(15,2) := 0;

BEGIN

    RAISE NOTICE 'START MANUAL SAVINGS TRANSACTION';

    IF NOT EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id) THEN
        RAISE EXCEPTION 'BILL NOT FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id AND status_id IN (39,40)) THEN
        RAISE EXCEPTION 'BILL ALREADY PAID';
    END IF;

    SELECT amount_due, bill_period_end
    INTO v_amount, v_due_date
    FROM monthly_saving_bills
    WHERE id = p_bill_id AND member_id = p_member_id AND saving_type_id = p_saving_type_id
    FOR UPDATE;

    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'INVALID MEMBER OR SAVING TYPE';
    END IF;

    RAISE NOTICE 'AMOUNT: %', v_amount;

    -- DENDA TELAT BAYAR (melewati due_date / tgl 27) DIAMBIL DARI funding_settings id=3
    -- Simpanan Wajib (saving_type_id=1) saja yang kena denda.
    IF v_due_date < CURRENT_DATE AND p_saving_type_id = 1 THEN
        SELECT monthly_limit INTO v_penalty
        FROM funding_settings
        WHERE id = 3
          AND is_active = TRUE
        LIMIT 1;

        v_penalty := COALESCE(v_penalty, 0);
    END IF;

    RAISE NOTICE 'PENALTY (DENDA TELAT): %', v_penalty;

    v_reference_code := 'MAN-SAV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('saving_payment_ref_seq')::TEXT, 5, '0');
    RAISE NOTICE 'REFERENCE CODE: %', v_reference_code;

    INSERT INTO saving_transactions (
        member_id, saving_type_id, transaction_type_id, payment_method_id,
        amount, status_id, payment_reference_id, monthly_saving_bill_id,
        transaction_date, created_at, updated_at
    )
    VALUES (p_member_id, p_saving_type_id, 1, 3, v_amount, 34, v_reference_code, p_bill_id, NOW(), NOW(), NOW());

    RAISE NOTICE 'SAVING TRANSACTION INSERTED';

    INSERT INTO manual_payments (
        payable_type_id, payment_method_id, notes, proof_file_path,
        payment_reference_id, verified_by, verified_at, created_at, updated_at
    )
    VALUES (1, 3, p_notes, file_pay, v_reference_code, p_admin_id, NOW(), NOW(), NOW());

    RAISE NOTICE 'MANUAL PAYMENT INSERTED';

    INSERT INTO saving_wallets (member_id, saving_type_id, balance, last_updated, created_at)
    VALUES (p_member_id, p_saving_type_id, v_amount, NOW(), NOW())
    ON CONFLICT (member_id, saving_type_id)
    DO UPDATE SET balance = saving_wallets.balance + EXCLUDED.balance, last_updated = NOW();

    RAISE NOTICE 'WALLET UPDATED';

    UPDATE monthly_saving_bills
    SET
        amount_paid = v_amount,
        penalty_due = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_due END,
        penalty_paid = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_paid END,
        status_id = CASE WHEN v_due_date < CURRENT_DATE THEN 40 ELSE 39 END,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_bill_id;

    RAISE NOTICE 'BILL UPDATED';
    RAISE NOTICE 'MANUAL SAVING PAYMENT SUCCESS';

END;

$procedure$
"""

SP_MANUAL_REVERSE = r"""
CREATE OR REPLACE PROCEDURE public.sp_manual_savings_transaction(IN p_bill_id integer, IN p_member_id integer, IN p_saving_type_id integer, IN file_pay character varying, IN p_admin_id integer, IN p_notes text)
 LANGUAGE plpgsql
AS $procedure$

DECLARE
    v_amount NUMERIC;
    v_reference_code VARCHAR(50);
    v_due_date DATE;
    v_penalty NUMERIC(15,2) := 0;

BEGIN

    RAISE NOTICE 'START MANUAL SAVINGS TRANSACTION';

    IF NOT EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id) THEN
        RAISE EXCEPTION 'BILL NOT FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM monthly_saving_bills WHERE id = p_bill_id AND status_id IN (39,40)) THEN
        RAISE EXCEPTION 'BILL ALREADY PAID';
    END IF;

    SELECT amount_due, bill_period_end
    INTO v_amount, v_due_date
    FROM monthly_saving_bills
    WHERE id = p_bill_id AND member_id = p_member_id AND saving_type_id = p_saving_type_id
    FOR UPDATE;

    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'INVALID MEMBER OR SAVING TYPE';
    END IF;

    RAISE NOTICE 'AMOUNT: %', v_amount;

    -- DENDA TELAT BAYAR (melewati due_date / tgl 27) DIAMBIL DARI funding_settings id=3
    IF v_due_date < CURRENT_DATE THEN
        SELECT monthly_limit INTO v_penalty
        FROM funding_settings
        WHERE id = 3
          AND is_active = TRUE
          AND effective_date >= CURRENT_DATE
        ORDER BY effective_date ASC
        LIMIT 1;

        v_penalty := COALESCE(v_penalty, 0);
    END IF;

    RAISE NOTICE 'PENALTY (DENDA TELAT): %', v_penalty;

    v_reference_code := 'MAN-SAV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('saving_payment_ref_seq')::TEXT, 5, '0');
    RAISE NOTICE 'REFERENCE CODE: %', v_reference_code;

    INSERT INTO saving_transactions (
        member_id, saving_type_id, transaction_type_id, payment_method_id,
        amount, status_id, payment_reference_id, monthly_saving_bill_id,
        transaction_date, created_at, updated_at
    )
    VALUES (p_member_id, p_saving_type_id, 1, 3, v_amount, 34, v_reference_code, p_bill_id, NOW(), NOW(), NOW());

    RAISE NOTICE 'SAVING TRANSACTION INSERTED';

    INSERT INTO manual_payments (
        payable_type_id, payment_method_id, notes, proof_file_path,
        payment_reference_id, verified_by, verified_at, created_at, updated_at
    )
    VALUES (1, 3, p_notes, file_pay, v_reference_code, p_admin_id, NOW(), NOW(), NOW());

    RAISE NOTICE 'MANUAL PAYMENT INSERTED';

    INSERT INTO saving_wallets (member_id, saving_type_id, balance, last_updated, created_at)
    VALUES (p_member_id, p_saving_type_id, v_amount, NOW(), NOW())
    ON CONFLICT (member_id, saving_type_id)
    DO UPDATE SET balance = saving_wallets.balance + EXCLUDED.balance, last_updated = NOW();

    RAISE NOTICE 'WALLET UPDATED';

    UPDATE monthly_saving_bills
    SET
        amount_paid = v_amount,
        penalty_due = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_due END,
        penalty_paid = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_paid END,
        status_id = CASE WHEN v_due_date < CURRENT_DATE THEN 40 ELSE 39 END,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_bill_id;

    RAISE NOTICE 'BILL UPDATED';
    RAISE NOTICE 'MANUAL SAVING PAYMENT SUCCESS';

END;

$procedure$
"""

SP_GATEWAY_FORWARD = r"""
CREATE OR REPLACE PROCEDURE public.sp_savings_gateway_payment(IN p_saving_transaction_id integer, IN p_gateway_status character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_member_id INT;
    v_saving_type_id INT;
    v_bill_id INT;
    v_amount NUMERIC;
    v_pgt_id_str VARCHAR(50);
    v_pgt_id INT;
    v_due_date DATE;
    v_penalty NUMERIC(15,2) := 0;
BEGIN
    RAISE NOTICE 'START SETTLE GATEWAY PAYMENT FOR SAVING TRANSACTION ID: %', p_saving_transaction_id;

    IF NOT EXISTS (SELECT 1 FROM saving_transactions WHERE id = p_saving_transaction_id) THEN
        RAISE EXCEPTION 'SAVING TRANSACTION RECORD NOT FOUND';
    END IF;

    SELECT
        member_id, saving_type_id, monthly_saving_bill_id, amount, payment_reference_id
    INTO
        v_member_id, v_saving_type_id, v_bill_id, v_amount, v_pgt_id_str
    FROM saving_transactions
    WHERE id = p_saving_transaction_id
    FOR UPDATE;

    v_pgt_id := NULLIF(v_pgt_id_str, '')::INT;

    IF v_pgt_id IS NOT NULL THEN
        UPDATE payment_gateway_transactions
        SET gateway_status = p_gateway_status, updated_at = NOW()
        WHERE id = v_pgt_id;
        RAISE NOTICE 'GATEWAY TRANSACTION UPDATED';
    END IF;

    UPDATE saving_transactions
    SET status_id = 34, transaction_date = NOW(), updated_at = NOW()
    WHERE id = p_saving_transaction_id;
    RAISE NOTICE 'SAVING TRANSACTION SUCCESS SETTLED';

    INSERT INTO saving_wallets (member_id, saving_type_id, balance, last_updated, created_at)
    VALUES (v_member_id, v_saving_type_id, v_amount, NOW(), NOW())
    ON CONFLICT (member_id, saving_type_id)
    DO UPDATE SET balance = saving_wallets.balance + EXCLUDED.balance, last_updated = NOW();
    RAISE NOTICE 'SAVING WALLET UPDATED';

    IF v_bill_id IS NOT NULL THEN
        SELECT bill_period_end INTO v_due_date FROM monthly_saving_bills WHERE id = v_bill_id FOR UPDATE;

        -- DENDA TELAT BAYAR (melewati due_date / tgl 27) DIAMBIL DARI funding_settings id=3
        -- Simpanan Wajib (saving_type_id=1) saja yang kena denda.
        IF v_due_date < CURRENT_DATE AND v_saving_type_id = 1 THEN
            SELECT monthly_limit INTO v_penalty
            FROM funding_settings
            WHERE id = 3
              AND is_active = TRUE
            LIMIT 1;

            v_penalty := COALESCE(v_penalty, 0);
        END IF;

        RAISE NOTICE 'PENALTY (DENDA TELAT): %', v_penalty;

        UPDATE monthly_saving_bills
        SET
            amount_paid = v_amount,
            penalty_due = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_due END,
            penalty_paid = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_paid END,
            status_id = CASE WHEN v_due_date < CURRENT_DATE THEN 40 ELSE 39 END,
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = v_bill_id;
        RAISE NOTICE 'MONTHLY SAVING BILL STATUS UPDATED';
    END IF;

    RAISE NOTICE 'SETTLE GATEWAY SAVING PAYMENT SUCCESS';
END;
$procedure$
"""

SP_GATEWAY_REVERSE = r"""
CREATE OR REPLACE PROCEDURE public.sp_savings_gateway_payment(IN p_saving_transaction_id integer, IN p_gateway_status character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_member_id INT;
    v_saving_type_id INT;
    v_bill_id INT;
    v_amount NUMERIC;
    v_pgt_id_str VARCHAR(50);
    v_pgt_id INT;
    v_due_date DATE;
    v_penalty NUMERIC(15,2) := 0;
BEGIN
    RAISE NOTICE 'START SETTLE GATEWAY PAYMENT FOR SAVING TRANSACTION ID: %', p_saving_transaction_id;

    IF NOT EXISTS (SELECT 1 FROM saving_transactions WHERE id = p_saving_transaction_id) THEN
        RAISE EXCEPTION 'SAVING TRANSACTION RECORD NOT FOUND';
    END IF;

    SELECT
        member_id, saving_type_id, monthly_saving_bill_id, amount, payment_reference_id
    INTO
        v_member_id, v_saving_type_id, v_bill_id, v_amount, v_pgt_id_str
    FROM saving_transactions
    WHERE id = p_saving_transaction_id
    FOR UPDATE;

    v_pgt_id := NULLIF(v_pgt_id_str, '')::INT;

    IF v_pgt_id IS NOT NULL THEN
        UPDATE payment_gateway_transactions
        SET gateway_status = p_gateway_status, updated_at = NOW()
        WHERE id = v_pgt_id;
        RAISE NOTICE 'GATEWAY TRANSACTION UPDATED';
    END IF;

    UPDATE saving_transactions
    SET status_id = 34, transaction_date = NOW(), updated_at = NOW()
    WHERE id = p_saving_transaction_id;
    RAISE NOTICE 'SAVING TRANSACTION SUCCESS SETTLED';

    INSERT INTO saving_wallets (member_id, saving_type_id, balance, last_updated, created_at)
    VALUES (v_member_id, v_saving_type_id, v_amount, NOW(), NOW())
    ON CONFLICT (member_id, saving_type_id)
    DO UPDATE SET balance = saving_wallets.balance + EXCLUDED.balance, last_updated = NOW();
    RAISE NOTICE 'SAVING WALLET UPDATED';

    IF v_bill_id IS NOT NULL THEN
        SELECT bill_period_end INTO v_due_date FROM monthly_saving_bills WHERE id = v_bill_id FOR UPDATE;

        -- DENDA TELAT BAYAR (melewati due_date / tgl 27) DIAMBIL DARI funding_settings id=3
        IF v_due_date < CURRENT_DATE THEN
            SELECT monthly_limit INTO v_penalty
            FROM funding_settings
            WHERE id = 3
              AND is_active = TRUE
              AND effective_date >= CURRENT_DATE
            ORDER BY effective_date ASC
            LIMIT 1;

            v_penalty := COALESCE(v_penalty, 0);
        END IF;

        RAISE NOTICE 'PENALTY (DENDA TELAT): %', v_penalty;

        UPDATE monthly_saving_bills
        SET
            amount_paid = v_amount,
            penalty_due = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_due END,
            penalty_paid = CASE WHEN v_penalty > 0 THEN v_penalty ELSE penalty_paid END,
            status_id = CASE WHEN v_due_date < CURRENT_DATE THEN 40 ELSE 39 END,
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = v_bill_id;
        RAISE NOTICE 'MONTHLY SAVING BILL STATUS UPDATED';
    END IF;

    RAISE NOTICE 'SETTLE GATEWAY SAVING PAYMENT SUCCESS';
END;
$procedure$
"""

SP_ROLLBACK_FORWARD = r"""
CREATE OR REPLACE PROCEDURE public.sp_rollback_savings_payroll_transaction(IN p_bill_id integer, IN p_member_id integer, IN p_saving_type_id integer)
 LANGUAGE plpgsql
AS $procedure$

DECLARE
    v_amount NUMERIC;
    v_reference_code VARCHAR(50);

BEGIN

    RAISE NOTICE 'START ROLLBACK SAVINGS PAYROLL';

    -- VALIDASI BILL ADA
    IF NOT EXISTS (
        SELECT 1
        FROM monthly_saving_bills
        WHERE id = p_bill_id
    ) THEN

        RAISE EXCEPTION 'BILL NOT FOUND';

    END IF;

    -- VALIDASI BILL SUDAH PAID
    IF NOT EXISTS (
        SELECT 1
        FROM monthly_saving_bills
        WHERE id = p_bill_id
          AND status_id IN (39,40)
    ) THEN

        RAISE EXCEPTION 'BILL IS NOT PAID';

    END IF;

    -- AMBIL DATA TRANSAKSI + LOCK ROW
    SELECT
        st.amount,
        st.payment_reference_id
    INTO
        v_amount,
        v_reference_code
    FROM saving_transactions st
    WHERE st.monthly_saving_bill_id = p_bill_id
      AND st.member_id = p_member_id
      AND st.saving_type_id = p_saving_type_id
      AND st.payment_method_id = 2
    ORDER BY st.id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_amount IS NULL THEN

        RAISE EXCEPTION 'SAVING TRANSACTION NOT FOUND';

    END IF;

    RAISE NOTICE 'AMOUNT: %', v_amount;
    RAISE NOTICE 'REFERENCE: %', v_reference_code;

    -- HAPUS BUKTI TRANSFER PAYROLL (manual_payments) TERKAIT TRANSAKSI INI
    DELETE FROM manual_payments
    WHERE payment_method_id = 2
      AND payable_type_id = 1
      AND payment_reference_id = v_reference_code;

    RAISE NOTICE 'PAYROLL PROOF (IF ANY) DELETED';

    -- DELETE SAVING TRANSACTION
    DELETE FROM saving_transactions
    WHERE monthly_saving_bill_id = p_bill_id
      AND member_id = p_member_id
      AND saving_type_id = p_saving_type_id
      AND payment_method_id = 2;

    RAISE NOTICE 'SAVING TRANSACTION DELETED';

    -- KURANGI WALLET BALANCE
    UPDATE saving_wallets
    SET
        balance = GREATEST(balance - v_amount, 0),
        last_updated = NOW()
    WHERE member_id = p_member_id
      AND saving_type_id = p_saving_type_id;

    RAISE NOTICE 'WALLET UPDATED';

    -- RESET BILL STATUS (termasuk hapus denda yang sudah kadung nempel)
    UPDATE monthly_saving_bills
    SET
        amount_paid = 0,
        status_id = 38,
        paid_at = NULL,
        penalty_due = NULL,
        penalty_paid = NULL,
        updated_at = NOW()
    WHERE id = p_bill_id;

    RAISE NOTICE 'BILL RESET';

    RAISE NOTICE 'ROLLBACK SAVINGS PAYROLL SUCCESS';

END;

$procedure$
"""

SP_ROLLBACK_REVERSE = r"""
CREATE OR REPLACE PROCEDURE public.sp_rollback_savings_payroll_transaction(IN p_bill_id integer, IN p_member_id integer, IN p_saving_type_id integer)
 LANGUAGE plpgsql
AS $procedure$

DECLARE
    v_amount NUMERIC;
    v_reference_code VARCHAR(50);

BEGIN

    RAISE NOTICE 'START ROLLBACK SAVINGS PAYROLL';

    -- VALIDASI BILL ADA
    IF NOT EXISTS (
        SELECT 1
        FROM monthly_saving_bills
        WHERE id = p_bill_id
    ) THEN

        RAISE EXCEPTION 'BILL NOT FOUND';

    END IF;

    -- VALIDASI BILL SUDAH PAID
    IF NOT EXISTS (
        SELECT 1
        FROM monthly_saving_bills
        WHERE id = p_bill_id
          AND status_id IN (39,40)
    ) THEN

        RAISE EXCEPTION 'BILL IS NOT PAID';

    END IF;

    -- AMBIL DATA TRANSAKSI + LOCK ROW
    SELECT
        st.amount,
        st.payment_reference_id
    INTO
        v_amount,
        v_reference_code
    FROM saving_transactions st
    WHERE st.monthly_saving_bill_id = p_bill_id
      AND st.member_id = p_member_id
      AND st.saving_type_id = p_saving_type_id
      AND st.payment_method_id = 2
    ORDER BY st.id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_amount IS NULL THEN

        RAISE EXCEPTION 'SAVING TRANSACTION NOT FOUND';

    END IF;

    RAISE NOTICE 'AMOUNT: %', v_amount;
    RAISE NOTICE 'REFERENCE: %', v_reference_code;

    -- HAPUS BUKTI TRANSFER PAYROLL (manual_payments) TERKAIT TRANSAKSI INI
    DELETE FROM manual_payments
    WHERE payment_method_id = 2
      AND payable_type_id = 1
      AND payment_reference_id = v_reference_code;

    RAISE NOTICE 'PAYROLL PROOF (IF ANY) DELETED';

    -- DELETE SAVING TRANSACTION
    DELETE FROM saving_transactions
    WHERE monthly_saving_bill_id = p_bill_id
      AND member_id = p_member_id
      AND saving_type_id = p_saving_type_id
      AND payment_method_id = 2;

    RAISE NOTICE 'SAVING TRANSACTION DELETED';

    -- KURANGI WALLET BALANCE
    UPDATE saving_wallets
    SET
        balance = GREATEST(balance - v_amount, 0),
        last_updated = NOW()
    WHERE member_id = p_member_id
      AND saving_type_id = p_saving_type_id;

    RAISE NOTICE 'WALLET UPDATED';

    -- RESET BILL STATUS
    UPDATE monthly_saving_bills
    SET
        amount_paid = 0,
        status_id = 38,
        paid_at = NULL,
        updated_at = NOW()
    WHERE id = p_bill_id;

    RAISE NOTICE 'BILL RESET';

    RAISE NOTICE 'ROLLBACK SAVINGS PAYROLL SUCCESS';

END;

$procedure$
"""


class Migration(migrations.Migration):

    dependencies = [
        ("saving", "0004_notification_mandatory_savings_type"),
    ]

    operations = [
        migrations.RunSQL(sql=SP_GENERATE_BILLS_FORWARD, reverse_sql=SP_GENERATE_BILLS_REVERSE),
        migrations.RunSQL(sql=SP_PAYROLL_FORWARD, reverse_sql=SP_PAYROLL_REVERSE),
        migrations.RunSQL(sql=SP_MANUAL_FORWARD, reverse_sql=SP_MANUAL_REVERSE),
        migrations.RunSQL(sql=SP_GATEWAY_FORWARD, reverse_sql=SP_GATEWAY_REVERSE),
        migrations.RunSQL(sql=SP_ROLLBACK_FORWARD, reverse_sql=SP_ROLLBACK_REVERSE),
    ]
