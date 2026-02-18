param(
    [string]$SourceDb = "C:\Users\User\Downloads\dataLTC.accdb",
    [string]$OutputRoot = "C:\Users\User\Downloads\For_www\chamrak_export"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function U([string]$EscapedText) {
    return [regex]::Unescape($EscapedText)
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Write-TextUtf8NoBom([string]$Path, [string]$Text) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Write-JsonUtf8NoBom([string]$Path, $Data, [int]$Depth = 64) {
    $json = $Data | ConvertTo-Json -Depth $Depth
    Write-TextUtf8NoBom -Path $Path -Text $json
}

function Escape-SqlIdent([string]$Name) {
    return $Name.Replace("]", "]]")
}

function Convert-ValueForJson($Value) {
    if ($null -eq $Value -or $Value -is [System.DBNull]) {
        return $null
    }
    if ($Value -is [datetime]) {
        return $Value.ToString("yyyy-MM-ddTHH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
    }
    if ($Value -is [bool]) {
        return [bool]$Value
    }
    if ($Value -is [byte[]]) {
        return ,([byte[]]$Value)
    }
    if ($Value -is [System.Array]) {
        if ($Value.Length -eq 0) {
            return ,([byte[]]@())
        }
        $isByteArray = $true
        foreach ($item in $Value) {
            if ($item -isnot [byte]) {
                $isByteArray = $false
                break
            }
        }
        if ($isByteArray) {
            return ,([byte[]]$Value)
        }
    }
    return $Value
}

function Get-ImageExtension([byte[]]$Bytes) {
    if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xD8 -and $Bytes[2] -eq 0xFF) {
        return "jpg"
    }
    if ($Bytes.Length -ge 8 -and $Bytes[0] -eq 0x89 -and $Bytes[1] -eq 0x50 -and $Bytes[2] -eq 0x4E -and $Bytes[3] -eq 0x47) {
        return "png"
    }
    if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0x42 -and $Bytes[1] -eq 0x4D) {
        return "bmp"
    }
    if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0x47 -and $Bytes[1] -eq 0x49 -and $Bytes[2] -eq 0x46) {
        return "gif"
    }
    return "bin"
}

function Get-Sha1Hex([byte[]]$Bytes) {
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    try {
        return (($sha1.ComputeHash($Bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha1.Dispose()
    }
}

function Get-Sha256HexFromText([string]$Text) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return (($sha256.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha256.Dispose()
    }
}

function Transform-ThaiText(
    [string]$Text,
    [string]$OldAmphurName,
    [string]$OldProvinceName,
    [string]$OldTambonName,
    [string]$NewTambonName,
    [string]$NewProvinceName
) {
    if ($null -eq $Text) {
        return $null
    }
    $Text = $Text.Replace($OldAmphurName, $NewTambonName)
    $Text = $Text.Replace($OldProvinceName, $NewProvinceName)
    $Text = $Text.Replace($OldTambonName, $NewTambonName)
    return $Text
}

$COL_TAMBON = U('\u0e15\u0e33\u0e1a\u0e25')
$COL_AMPHUR = U('\u0e2d\u0e33\u0e40\u0e20\u0e2d')
$COL_PROVINCE = U('\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e31\u0e14')
$COL_CODE = U('\u0e23\u0e2b\u0e31\u0e2a')
$COL_OFFICE_NAME = U('\u0e0a\u0e37\u0e48\u0e2d\u0e2a\u0e33\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19')
$COL_OFFICE_SHORT = U('\u0e2a\u0e19\u0e07')
$COL_STATUS_NAME = U('\u0e0a\u0e37\u0e48\u0e2d\u0e2a\u0e16\u0e32\u0e19\u0e30')
$COL_INCOME1 = U('\u0e23\u0e32\u0e22\u0e23\u0e31\u0e1a\u0031')
$COL_UNIT_CODE = U('\u0e23\u0e2b\u0e31\u0e2a\u0e2b\u0e19\u0e48\u0e27\u0e22')
$COL_UNIT_NAME = U('\u0e2b\u0e19\u0e48\u0e27\u0e22')

$WORD_CHAMRAK = U('\u0e0a\u0e33\u0e23\u0e32\u0e01')
$WORD_MUEANG_TRAT = U('\u0e40\u0e21\u0e37\u0e2d\u0e07\u0e15\u0e23\u0e32\u0e14')
$WORD_TRAT = U('\u0e15\u0e23\u0e32\u0e14')
$WORD_OLD_PONGNAMRON = U('\u0e42\u0e1b\u0e48\u0e07\u0e19\u0e49\u0e33\u0e23\u0e49\u0e2d\u0e19')
$WORD_OLD_CHANTHABURI = U('\u0e08\u0e31\u0e19\u0e17\u0e1a\u0e38\u0e23\u0e35')
$WORD_OLD_TUBSAI = U('\u0e17\u0e31\u0e1a\u0e44\u0e17\u0e23')

$OFFICE_SHORT_NEW = U('\u0e40\u0e17\u0e28\u0e1a\u0e32\u0e25\u0e15\u0e33\u0e1a\u0e25\u0e0a\u0e33\u0e23\u0e32\u0e01')
$OFFICE_NAME_NEW = U('\u0e28\u0e39\u0e19\u0e22\u0e4c\u0e1e\u0e31\u0e12\u0e19\u0e32\u0e04\u0e38\u0e13\u0e20\u0e32\u0e1e\u0e0a\u0e35\u0e27\u0e34\u0e15\u0e1c\u0e39\u0e49\u0e2a\u0e39\u0e07\u0e2d\u0e32\u0e22\u0e38\u0020\u0e1c\u0e39\u0e49\u0e1e\u0e34\u0e01\u0e32\u0e23\u0020\u0e41\u0e25\u0e30\u0e1c\u0e39\u0e49\u0e17\u0e35\u0e48\u0e21\u0e35\u0e20\u0e32\u0e27\u0e30\u0e1e\u0e36\u0e48\u0e07\u0e1e\u0e34\u0e07\u0020\u0e17\u0e15\u002e\u0e0a\u0e33\u0e23\u0e32\u0e01')

$TABLE_INCOME_EXPENSE = U('\u0074\u0062\u006c\u005f\u0e23\u0e32\u0e22\u0e23\u0e31\u0e1a\u0e23\u0e32\u0e22\u0e08\u0e48\u0e32\u0e22')
$TABLE_STATUS = U('\u0074\u0062\u006c\u005f\u0e2a\u0e16\u0e32\u0e19\u0e30')
$TABLE_MUNICIPALITY = U('\u0e40\u0e17\u0e28\u0e1a\u0e32\u0e25')
$TABLE_UNIT = U('\u0e2b\u0e19\u0e48\u0e27\u0e22')

$GEO_TABLES = @("tb_province", "tb_amphur", "tb_district")
$FORBIDDEN_WORDS = @($WORD_OLD_PONGNAMRON, $WORD_OLD_CHANTHABURI, $WORD_OLD_TUBSAI)

$dataDir = Join-Path $OutputRoot "data"
$metaDir = Join-Path $OutputRoot "metadata"
$columnAliasesDir = Join-Path $metaDir "column_aliases"
$assetDir = Join-Path $OutputRoot "assets"
$municipalityAssetDir = Join-Path $assetDir "t25_municipality"

Ensure-Directory -Path $OutputRoot
Ensure-Directory -Path $dataDir
Ensure-Directory -Path $metaDir
Ensure-Directory -Path $columnAliasesDir
Ensure-Directory -Path $assetDir
Ensure-Directory -Path $municipalityAssetDir

$tableAliasMap = [ordered]@{}
$tableAliasMap["cg"] = "t01_cg"
$tableAliasMap["cm"] = "t02_cm"
$tableAliasMap["cmMoney"] = "t03_cmmoney"
$tableAliasMap["DataJ"] = "t04_dataj"
$tableAliasMap["disproductB"] = "t05_disproductb"
$tableAliasMap["disproductB4"] = "t06_disproductb4"
$tableAliasMap["GRO"] = "t07_gro"
$tableAliasMap["inlist"] = "t08_inlist"
$tableAliasMap["intproduct"] = "t09_intproduct"
$tableAliasMap["intproductB"] = "t10_intproductb"
$tableAliasMap["intype"] = "t11_intype"
$tableAliasMap["outlist"] = "t12_outlist"
$tableAliasMap["outproduct"] = "t13_outproduct"
$tableAliasMap["outproductB"] = "t14_outproductb"
$tableAliasMap["outtype"] = "t15_outtype"
$tableAliasMap["product"] = "t16_product"
$tableAliasMap["productB"] = "t17_productb"
$tableAliasMap["TAI"] = "t18_tai"
$tableAliasMap["tb_amphur"] = "t19_tb_amphur"
$tableAliasMap["tb_district"] = "t20_tb_district"
$tableAliasMap["tb_province"] = "t21_tb_province"
$tableAliasMap["tbl_naneout"] = "t22_tbl_naneout"
$tableAliasMap[$TABLE_INCOME_EXPENSE] = "t23_tbl_income_expense"
$tableAliasMap[$TABLE_STATUS] = "t24_tbl_status"
$tableAliasMap[$TABLE_MUNICIPALITY] = "t25_municipality"
$tableAliasMap[$TABLE_UNIT] = "t26_unit"

$connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$SourceDb;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connectionString)
$manifestRows = New-Object System.Collections.Generic.List[object]
$exportedRowsByTable = @{}
$rawRowsByTable = @{}
$sourceCountByTable = @{}
$exportedCountByTable = @{}
$geoHashChecks = New-Object System.Collections.Generic.List[object]
$dateColumnsByTable = @{}
$columnDefsByTable = @{}
$picExtracted = 0
$picFoundInSource = 0
$generatedUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", [System.Globalization.CultureInfo]::InvariantCulture)

try {
    $conn.Open()

    $allTablesSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
    $tableNames = @(
        $allTablesSchema |
            Where-Object { $_.TABLE_TYPE -eq "TABLE" -and $_.TABLE_NAME -notlike "MSys*" } |
            ForEach-Object { [string]$_.TABLE_NAME }
    )

    $missingInDb = @($tableAliasMap.Keys | Where-Object { $tableNames -notcontains $_ })
    if ($missingInDb.Count -gt 0) {
        throw "Missing expected tables in DB: $($missingInDb -join ', ')"
    }
    $unknownInDb = @($tableNames | Where-Object { -not $tableAliasMap.Contains($_) })
    if ($unknownInDb.Count -gt 0) {
        throw "Found tables without alias mapping: $($unknownInDb -join ', ')"
    }

    $columnsSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Columns, $null)

    foreach ($tableName in $tableNames) {
        $colDefs = @(
            $columnsSchema |
                Where-Object { $_.TABLE_NAME -eq $tableName } |
                Sort-Object ORDINAL_POSITION |
                ForEach-Object {
                    $maxLength = $null
                    if ($_.CHARACTER_MAXIMUM_LENGTH -ne $null -and $_.CHARACTER_MAXIMUM_LENGTH -ne [System.DBNull]::Value) {
                        $maxLength = [int]$_.CHARACTER_MAXIMUM_LENGTH
                    }
                    $ordinal = 0
                    if ($_.ORDINAL_POSITION -ne $null -and $_.ORDINAL_POSITION -ne [System.DBNull]::Value) {
                        $ordinal = [int]$_.ORDINAL_POSITION
                    }
                    [ordered]@{
                        column_name = [string]$_.COLUMN_NAME
                        data_type = [int]$_.DATA_TYPE
                        max_length = $maxLength
                        ordinal = $ordinal
                    }
                }
        )
        $columnDefsByTable[$tableName] = $colDefs
        $dateColumnsByTable[$tableName] = @($colDefs | Where-Object { $_.data_type -eq 7 } | ForEach-Object { $_.column_name })
    }

    $pkSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Primary_Keys, $null)
    $primaryKeys = @(
        $pkSchema |
            Where-Object { $_.TABLE_NAME -notlike "MSys*" } |
            Sort-Object TABLE_NAME, ORDINAL |
            ForEach-Object {
                [ordered]@{
                    table_name = [string]$_.TABLE_NAME
                    table_alias = [string]$tableAliasMap[[string]$_.TABLE_NAME]
                    column_name = [string]$_.COLUMN_NAME
                    pk_name = [string]$_.PK_NAME
                    ordinal = [int]$_.ORDINAL
                }
            }
    )

    $fkSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Foreign_Keys, $null)
    $foreignKeys = @(
        $fkSchema |
            Where-Object {
                $_.PK_TABLE_NAME -notlike "MSys*" -and
                $_.FK_TABLE_NAME -notlike "MSys*"
            } |
            ForEach-Object {
                [ordered]@{
                    pk_table_name = [string]$_.PK_TABLE_NAME
                    pk_table_alias = [string]$tableAliasMap[[string]$_.PK_TABLE_NAME]
                    pk_column_name = [string]$_.PK_COLUMN_NAME
                    fk_table_name = [string]$_.FK_TABLE_NAME
                    fk_table_alias = [string]$tableAliasMap[[string]$_.FK_TABLE_NAME]
                    fk_column_name = [string]$_.FK_COLUMN_NAME
                }
            }
    )

    foreach ($tableName in $tableNames) {
        $tableAlias = [string]$tableAliasMap[$tableName]
        $safeTable = Escape-SqlIdent -Name $tableName
        $isGeoTable = $GEO_TABLES -contains $tableName
        $isMunicipality = $tableAlias -eq "t25_municipality"
        $isUnitTable = $tableAlias -eq "t26_unit"

        $countCmd = $conn.CreateCommand()
        $countCmd.CommandText = "SELECT COUNT(*) FROM [$safeTable]"
        $sourceCount = [int]$countCmd.ExecuteScalar()
        $sourceCountByTable[$tableName] = $sourceCount

        $readCmd = $conn.CreateCommand()
        $readCmd.CommandText = "SELECT * FROM [$safeTable]"
        $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($readCmd)
        $dt = New-Object System.Data.DataTable
        [void]$adapter.Fill($dt)

        $rawRows = New-Object System.Collections.Generic.List[object]
        $finalRows = New-Object System.Collections.Generic.List[object]
        $columnNames = @($columnDefsByTable[$tableName] | ForEach-Object { $_.column_name })

        $rowIndex = 0
        foreach ($dr in $dt.Rows) {
            $rawRow = [ordered]@{}
            $finalRow = [ordered]@{}
            $picBytes = $null

            foreach ($colDef in $columnDefsByTable[$tableName]) {
                $colName = $colDef.column_name
                $v = Convert-ValueForJson -Value $dr[$colName]

                if ($v -is [byte[]]) {
                    if ($isMunicipality -and $colName -eq "pic" -and $v.Length -gt 0) {
                        $picBytes = [byte[]]$v
                        $picFoundInSource++
                    }
                    $rawRow[$colName] = $null
                    $finalRow[$colName] = $null
                    continue
                }

                $rawRow[$colName] = $v
                $finalRow[$colName] = $v
            }

            if (-not $isGeoTable) {
                foreach ($k in @($finalRow.Keys)) {
                    if ($finalRow[$k] -is [string]) {
                        $finalRow[$k] = Transform-ThaiText `
                            -Text ([string]$finalRow[$k]) `
                            -OldAmphurName $WORD_OLD_PONGNAMRON `
                            -OldProvinceName $WORD_OLD_CHANTHABURI `
                            -OldTambonName $WORD_OLD_TUBSAI `
                            -NewTambonName $WORD_CHAMRAK `
                            -NewProvinceName $WORD_TRAT
                    }
                }

                if ($columnNames -contains $COL_TAMBON) {
                    $finalRow[$COL_TAMBON] = if ($isMunicipality) { "230113" } else { $WORD_CHAMRAK }
                }
                if ($columnNames -contains $COL_AMPHUR) {
                    $finalRow[$COL_AMPHUR] = if ($isMunicipality) { "160" } else { $WORD_MUEANG_TRAT }
                }
                if ($columnNames -contains $COL_PROVINCE) {
                    $finalRow[$COL_PROVINCE] = if ($isMunicipality) { "14" } else { $WORD_TRAT }
                }
                if ($isMunicipality -and ($columnNames -contains $COL_CODE)) {
                    $finalRow[$COL_CODE] = "23000"
                }
                if ($isUnitTable -and ($columnNames -contains $COL_CODE)) {
                    $finalRow[$COL_CODE] = "23000"
                }
                if ($isMunicipality -and ($columnNames -contains $COL_OFFICE_SHORT)) {
                    $finalRow[$COL_OFFICE_SHORT] = $OFFICE_SHORT_NEW
                }
                if ($isMunicipality -and ($columnNames -contains $COL_OFFICE_NAME)) {
                    $finalRow[$COL_OFFICE_NAME] = $OFFICE_NAME_NEW
                }
            }

            if ($isMunicipality -and $null -ne $picBytes -and $picBytes.Length -gt 0) {
                $rowId = if ($finalRow.Contains("idt") -and $null -ne $finalRow["idt"]) { [string]$finalRow["idt"] } else { [string]($rowIndex + 1) }
                $safeId = ($rowId -replace "[^A-Za-z0-9_-]", "_")
                $ext = Get-ImageExtension -Bytes $picBytes
                $fileName = "{0}_pic.{1}" -f $safeId, $ext
                $fullAssetPath = Join-Path $municipalityAssetDir $fileName
                [System.IO.File]::WriteAllBytes($fullAssetPath, $picBytes)
                $sha1 = Get-Sha1Hex -Bytes $picBytes
                $relativePath = ("assets/t25_municipality/{0}" -f $fileName)
                $finalRow["_pic_asset"] = [ordered]@{
                    path = $relativePath
                    bytes = [int]$picBytes.Length
                    sha1 = $sha1
                    format = $ext
                }
                $picExtracted++
            }

            $rawRows.Add([pscustomobject]$rawRow)
            $finalRows.Add([pscustomobject]$finalRow)
            $rowIndex++
        }

        $rawRowsArray = [object[]]$rawRows.ToArray()
        $finalRowsArray = [object[]]$finalRows.ToArray()

        if ($isGeoTable) {
            $rawJsonCanonical = $rawRowsArray | ConvertTo-Json -Depth 64 -Compress
            $finalJsonCanonical = $finalRowsArray | ConvertTo-Json -Depth 64 -Compress
            $geoHashChecks.Add([pscustomobject]@{
                table_name = $tableName
                table_alias = $tableAlias
                pre_sha256 = Get-Sha256HexFromText -Text $rawJsonCanonical
                post_sha256 = Get-Sha256HexFromText -Text $finalJsonCanonical
                equal = ((Get-Sha256HexFromText -Text $rawJsonCanonical) -eq (Get-Sha256HexFromText -Text $finalJsonCanonical))
            }) | Out-Null
        }

        $dataFile = Join-Path $dataDir ("{0}.json" -f $tableAlias)
        Write-JsonUtf8NoBom -Path $dataFile -Data $finalRowsArray -Depth 64

        $exportedRowsByTable[$tableName] = $finalRowsArray
        $rawRowsByTable[$tableName] = $rawRowsArray
        $exportedCountByTable[$tableName] = [int]$finalRows.Count

        $pkColsForTable = @($primaryKeys | Where-Object { $_.table_name -eq $tableName } | ForEach-Object { $_.column_name })
        $manifestRows.Add([pscustomobject]@{
            table_name = $tableName
            table_alias = $tableAlias
            file = ("data/{0}.json" -f $tableAlias)
            row_count = [int]$finalRows.Count
            primary_key = @($pkColsForTable)
        }) | Out-Null
    }

    foreach ($tableName in $tableNames) {
        $tableAlias = [string]$tableAliasMap[$tableName]
        $columnDefs = @($columnDefsByTable[$tableName])
        $columnAliasRows = New-Object System.Collections.Generic.List[object]
        $i = 1
        foreach ($cd in $columnDefs) {
            $columnAliasRows.Add([pscustomobject]@{
                column_name = $cd.column_name
                alias = ("c{0:d2}" -f $i)
                data_type = $cd.data_type
                max_length = $cd.max_length
                ordinal = $cd.ordinal
            }) | Out-Null
            $i++
        }

        $columnAliasRowsArray = [object[]]$columnAliasRows.ToArray()
        $columnAliasDoc = [pscustomobject]@{
            table_name = $tableName
            table_alias = $tableAlias
            columns = $columnAliasRowsArray
        }
        $columnAliasFile = Join-Path $columnAliasesDir ("{0}.json" -f $tableAlias)
        Write-JsonUtf8NoBom -Path $columnAliasFile -Data $columnAliasDoc -Depth 64
    }

    $tableAliasItems = @(
        $manifestRows |
            Sort-Object table_alias |
            ForEach-Object {
                [ordered]@{
                    table_name = $_.table_name
                    table_alias = $_.table_alias
                }
            }
    )
    $byTableName = [ordered]@{}
    $byTableAlias = [ordered]@{}
    foreach ($item in $tableAliasItems) {
        $byTableName[$item.table_name] = $item.table_alias
        $byTableAlias[$item.table_alias] = $item.table_name
    }

    $tableAliasDoc = [ordered]@{
        generated_at = $generatedUtc
        items = $tableAliasItems
        by_table_name = $byTableName
        by_table_alias = $byTableAlias
    }
    Write-JsonUtf8NoBom -Path (Join-Path $metaDir "table_alias_map.json") -Data $tableAliasDoc -Depth 64
    Write-JsonUtf8NoBom -Path (Join-Path $metaDir "primary_keys.json") -Data @($primaryKeys) -Depth 64
    Write-JsonUtf8NoBom -Path (Join-Path $metaDir "foreign_keys.json") -Data @($foreignKeys) -Depth 64

    $totalRows = [int](($manifestRows | Measure-Object -Property row_count -Sum).Sum)
    $manifestDoc = [ordered]@{
        generated_at = $generatedUtc
        source_db = $SourceDb
        output_root = $OutputRoot
        table_count = [int]$manifestRows.Count
        total_rows = $totalRows
        geo_lookup_tables = @(
            $GEO_TABLES |
                ForEach-Object {
                    [ordered]@{
                        table_name = $_
                        table_alias = $tableAliasMap[$_]
                    }
                }
        )
        transformed_tables = @(
            $manifestRows |
                Where-Object { $GEO_TABLES -notcontains $_.table_name } |
                Sort-Object table_alias |
                ForEach-Object { $_.table_alias }
        )
        tables = @($manifestRows | Sort-Object table_alias)
    }
    Write-JsonUtf8NoBom -Path (Join-Path $OutputRoot "manifest.json") -Data $manifestDoc -Depth 64

    $rowCountDetails = @(
        $manifestRows |
            Sort-Object table_alias |
            ForEach-Object {
                [ordered]@{
                    table_name = $_.table_name
                    table_alias = $_.table_alias
                    source_rows = [int]$sourceCountByTable[$_.table_name]
                    exported_rows = [int]$exportedCountByTable[$_.table_name]
                    pass = ([int]$sourceCountByTable[$_.table_name] -eq [int]$exportedCountByTable[$_.table_name])
                }
            }
    )
    $rowCountPass = -not ($rowCountDetails | Where-Object { -not $_.pass })

    $geoPass = -not ($geoHashChecks | Where-Object { -not $_.equal })

    $locationChecks = New-Object System.Collections.Generic.List[object]
    foreach ($rowInfo in $manifestRows) {
        $tableName = $rowInfo.table_name
        if ($GEO_TABLES -contains $tableName) {
            continue
        }
        $alias = $rowInfo.table_alias
        $rows = @($exportedRowsByTable[$tableName])
        $colNames = @($columnDefsByTable[$tableName] | ForEach-Object { $_.column_name })

        if ($colNames -contains $COL_TAMBON) {
            $expected = if ($alias -eq "t25_municipality") { "230113" } else { $WORD_CHAMRAK }
            $bad = @($rows | Where-Object { $_.$COL_TAMBON -ne $expected })
            $locationChecks.Add([pscustomobject]@{
                table_name = $tableName
                table_alias = $alias
                column_name = $COL_TAMBON
                expected = $expected
                pass = ($bad.Count -eq 0)
                violations = $bad.Count
            }) | Out-Null
        }
        if ($colNames -contains $COL_AMPHUR) {
            $expected = if ($alias -eq "t25_municipality") { "160" } else { $WORD_MUEANG_TRAT }
            $bad = @($rows | Where-Object { $_.$COL_AMPHUR -ne $expected })
            $locationChecks.Add([pscustomobject]@{
                table_name = $tableName
                table_alias = $alias
                column_name = $COL_AMPHUR
                expected = $expected
                pass = ($bad.Count -eq 0)
                violations = $bad.Count
            }) | Out-Null
        }
        if ($colNames -contains $COL_PROVINCE) {
            $expected = if ($alias -eq "t25_municipality") { "14" } else { $WORD_TRAT }
            $bad = @($rows | Where-Object { $_.$COL_PROVINCE -ne $expected })
            $locationChecks.Add([pscustomobject]@{
                table_name = $tableName
                table_alias = $alias
                column_name = $COL_PROVINCE
                expected = $expected
                pass = ($bad.Count -eq 0)
                violations = $bad.Count
            }) | Out-Null
        }
    }
    $locationPass = -not ($locationChecks | Where-Object { -not $_.pass })

    $municipalityRows = @($exportedRowsByTable[$TABLE_MUNICIPALITY])
    $municipalityNamesPass = ($municipalityRows.Count -gt 0)
    if ($municipalityNamesPass) {
        $nameBad = @($municipalityRows | Where-Object { $_.$COL_OFFICE_NAME -ne $OFFICE_NAME_NEW })
        $shortBad = @($municipalityRows | Where-Object { $_.$COL_OFFICE_SHORT -ne $OFFICE_SHORT_NEW })
        $municipalityNamesPass = ($nameBad.Count -eq 0 -and $shortBad.Count -eq 0)
    }

    $keywordHits = New-Object System.Collections.Generic.List[object]
    foreach ($rowInfo in $manifestRows) {
        $tableName = $rowInfo.table_name
        if ($GEO_TABLES -contains $tableName) {
            continue
        }
        foreach ($r in @($exportedRowsByTable[$tableName])) {
            foreach ($p in $r.PSObject.Properties) {
                if ($p.Value -isnot [string]) {
                    continue
                }
                foreach ($w in $FORBIDDEN_WORDS) {
                    if (($p.Value).Contains($w)) {
                        $keywordHits.Add([pscustomobject]@{
                            table_name = $tableName
                            table_alias = $rowInfo.table_alias
                            column_name = $p.Name
                            word = $w
                        }) | Out-Null
                    }
                }
            }
        }
    }
    $keywordPass = ($keywordHits.Count -eq 0)

    $isoPattern = "^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$"
    $dateFailures = New-Object System.Collections.Generic.List[object]
    foreach ($rowInfo in $manifestRows) {
        $tableName = $rowInfo.table_name
        $dateCols = @($dateColumnsByTable[$tableName])
        if ($dateCols.Count -eq 0) {
            continue
        }
        foreach ($r in @($exportedRowsByTable[$tableName])) {
            foreach ($dc in $dateCols) {
                $v = $r.$dc
                if ($null -eq $v) {
                    continue
                }
                if ($v -isnot [string] -or ($v -notmatch $isoPattern)) {
                    $dateFailures.Add([pscustomobject]@{
                        table_name = $tableName
                        table_alias = $rowInfo.table_alias
                        column_name = $dc
                        value = $v
                    }) | Out-Null
                }
            }
        }
    }
    $isoDatePass = ($dateFailures.Count -eq 0)

    $picIssues = New-Object System.Collections.Generic.List[object]
    foreach ($row in $municipalityRows) {
        $picAssetProp = $row.PSObject.Properties["_pic_asset"]
        if ($null -eq $picAssetProp -or $null -eq $picAssetProp.Value) {
            continue
        }
        $relPath = [string]$picAssetProp.Value.path
        $fullPath = Join-Path $OutputRoot ($relPath -replace "/", "\")
        if (-not (Test-Path -LiteralPath $fullPath)) {
            $picIssues.Add([pscustomobject]@{ missing = $relPath }) | Out-Null
        }
    }
    $picPass = ($picIssues.Count -eq 0 -and $picExtracted -eq $picFoundInSource)

    $utf8Issues = New-Object System.Collections.Generic.List[object]
    $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
    $jsonFiles = @(
        Get-ChildItem -LiteralPath $OutputRoot -Recurse -File |
            Where-Object { $_.Extension -eq ".json" } |
            Select-Object -ExpandProperty FullName
    )
    foreach ($jf in $jsonFiles) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($jf)
            [void]$utf8Strict.GetString($bytes)
        } catch {
            $utf8Issues.Add([pscustomobject]@{
                file = $jf
                error = $_.Exception.Message
            }) | Out-Null
        }
    }
    $utf8Pass = ($utf8Issues.Count -eq 0)

    $geoHashArray = [object[]]$geoHashChecks.ToArray()
    $locationChecksArray = [object[]]$locationChecks.ToArray()
    $keywordHitsArray = [object[]]$keywordHits.ToArray()
    $dateFailuresArray = [object[]]$dateFailures.ToArray()
    $picIssuesArray = [object[]]$picIssues.ToArray()
    $utf8IssuesArray = [object[]]$utf8Issues.ToArray()

    $checks = New-Object PSObject
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "row_count_match" -Value ([pscustomobject]@{
        pass = $rowCountPass
        details = $rowCountDetails
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "geo_byte_equivalent" -Value ([pscustomobject]@{
        pass = $geoPass
        details = $geoHashArray
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "location_override" -Value ([pscustomobject]@{
        pass = $locationPass
        details = $locationChecksArray
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "municipality_name_override" -Value ([pscustomobject]@{
        pass = $municipalityNamesPass
        expected = [pscustomobject]@{
            office_name = $OFFICE_NAME_NEW
            office_short = $OFFICE_SHORT_NEW
        }
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "forbidden_words_removed" -Value ([pscustomobject]@{
        pass = $keywordPass
        forbidden_words = @($FORBIDDEN_WORDS)
        hits = $keywordHitsArray
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "iso_datetime_format" -Value ([pscustomobject]@{
        pass = $isoDatePass
        failures = $dateFailuresArray
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "pic_asset_export" -Value ([pscustomobject]@{
        pass = $picPass
        source_pic_count = [int]$picFoundInSource
        exported_pic_count = [int]$picExtracted
        issues = $picIssuesArray
    })
    Add-Member -InputObject $checks -MemberType NoteProperty -Name "utf8_json" -Value ([pscustomobject]@{
        pass = $utf8Pass
        checked_files = [int]$jsonFiles.Count
        issues = $utf8IssuesArray
    })
    $allPass = -not ($checks.PSObject.Properties | Where-Object { -not $_.Value.pass })
    $validation = [pscustomobject]@{
        generated_at = $generatedUtc
        checks = $checks
        summary = [pscustomobject]@{
            pass_all = $allPass
            total_tables = [int]$manifestRows.Count
            total_rows = $totalRows
        }
    }
    Write-JsonUtf8NoBom -Path (Join-Path $metaDir "validation_report.json") -Data $validation -Depth 64

    $readme = @"
# chamrak_export

This folder contains full export data from:
- source: $SourceDb
- generated_at_utc: $generatedUtc

## What is included
- Full table export (26 tables) in `data/*.json`
- Metadata for table/column aliases and constraints in `metadata/`
- Municipality image asset extraction in `assets/t25_municipality/`

## Transform rules applied
- Non-geo tables were normalized to:
  - tambon: $WORD_CHAMRAK
  - amphur: $WORD_MUEANG_TRAT
  - province: $WORD_TRAT
- Municipality code fields were overridden:
  - $COL_TAMBON = 230113
  - $COL_AMPHUR = 160
  - $COL_PROVINCE = 14
  - $COL_CODE = 23000
- Municipality office naming:
  - $COL_OFFICE_SHORT = $OFFICE_SHORT_NEW
  - $COL_OFFICE_NAME = $OFFICE_NAME_NEW
- Geo lookup tables kept unchanged:
  - tb_province, tb_amphur, tb_district

## Key files
- `manifest.json`
- `metadata/table_alias_map.json`
- `metadata/column_aliases/*.json`
- `metadata/primary_keys.json`
- `metadata/foreign_keys.json`
- `metadata/validation_report.json`

## Data format
- Date/DateTime fields are ISO 8601 (`yyyy-MM-ddTHH:mm:ss`)
- Null values are `null`
- Text is UTF-8 JSON
- Binary `pic` field is extracted as files with `_pic_asset` metadata

## Validation
See `metadata/validation_report.json`.
"@
    Write-TextUtf8NoBom -Path (Join-Path $OutputRoot "README.md") -Text $readme

    Write-Host ("Export complete. Tables: {0}, Rows: {1}, Validation pass: {2}" -f $manifestRows.Count, $totalRows, $allPass)
    Write-Host ("Output: {0}" -f $OutputRoot)
}
finally {
    if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
        $conn.Close()
    }
}
